"use client";

import {
  AudioTrack,
  LiveKitRoom,
  type TrackReference,
  VideoTrack,
  useAudioPlayback,
  useLocalParticipant,
  useParticipants,
  useTracks,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { type ReactNode, createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { renderSVG } from "uqr";
import { cameraLink, soloCameraLink, soloVideoToken, videoToken } from "@/app/online-actions";
import { Avatar, Sheet } from "@/components/ui";
import { type CameraLink, MIC_ATTRIBUTE, type MicSource, cameraIdentity, identityPlayer } from "@/lib/friends-types";
import { type GamePlayer, gameStore } from "@/lib/game-store";
import type { RoomActionResult } from "@/lib/rooms-types";

/**
 * Camera and voice for a room, through LiveKit. The camera is a phone pointed
 * at the board, paired with a QR code; the iPad only sends your voice (or lets
 * the phone send it) and plays everyone else's. All optional: without it the
 * room works the same.
 */

type Creds = RoomActionResult<{ url: string; token: string }>;
type Ctx = { on: boolean; meId: string; voice: boolean; link: () => Promise<RoomActionResult<CameraLink>> };
const Video = createContext<Ctx>({ on: false, meId: "", voice: false, link: async () => ({ ok: false, error: "video_unavailable" }) });

export function RoomVideo({ roomId, meId, children }: { roomId: string; meId: string; children: ReactNode }) {
  return (
    <LiveVideo meId={meId} voice credentials={() => videoToken(roomId)} link={() => cameraLink(roomId)} keyed={roomId}>
      {children}
    </LiveVideo>
  );
}

/** A local game's own LiveKit room, just for this player's phone camera: no voice, nobody else. */
export function SoloVideo({ meId, enabled, children }: { meId: string; enabled: boolean; children: ReactNode }) {
  return (
    <LiveVideo meId={meId} voice={false} credentials={soloVideoToken} link={soloCameraLink} keyed={enabled ? meId : ""}>
      {children}
    </LiveVideo>
  );
}

function LiveVideo({
  meId,
  voice,
  credentials,
  link,
  keyed,
  children,
}: {
  meId: string;
  voice: boolean;
  credentials: () => Promise<Creds>;
  link: Ctx["link"];
  /** Fetches new credentials when this changes. */
  keyed: string;
  children: ReactNode;
}) {
  const [creds, setCreds] = useState<{ url: string; token: string } | null>(null);

  useEffect(() => {
    // An empty key means "not now": stay disconnected and don't ask for a token.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!keyed) return setCreds(null);
    let live = true;
    credentials()
      .then((r) => live && r.ok && setCreds({ url: r.url, token: r.token }))
      .catch(() => {});
    return () => {
      live = false;
    };
    // `credentials` is a fresh closure each render; `keyed` says when it means something new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyed]);

  // Always rendered, so the room's UI doesn't remount when the token arrives.
  return (
    <LiveKitRoom
      serverUrl={creds?.url}
      token={creds?.token}
      connect={!!creds}
      audio={false}
      video={false}
      options={{ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }}
      className="contents"
    >
      <Video.Provider value={{ on: !!creds, meId, voice, link }}>
        {children}
        {creds && voice && <Voices meId={meId} />}
        {creds && voice && <MicSync />}
      </Video.Provider>
    </LiveKitRoom>
  );
}

export function useVideoOn() {
  return useContext(Video).on;
}

/** Everyone else's voices. Never your own phone's mic: you'd hear yourself on a delay. */
function Voices({ meId }: { meId: string }) {
  const tracks = useTracks([Track.Source.Microphone], { onlySubscribed: true });
  return tracks
    .filter((t) => identityPlayer(t.participant.identity) !== meId)
    .map((t) => <AudioTrack key={t.publication.trackSid} trackRef={t as TrackReference} />);
}

const MIC_PREF = "mic";
const subscribeMic = (l: () => void) => {
  window.addEventListener("storage", l);
  window.addEventListener("sd-mic", l);
  return () => {
    window.removeEventListener("storage", l);
    window.removeEventListener("sd-mic", l);
  };
};
function useMicSource() {
  return useSyncExternalStore(subscribeMic, () => gameStore.prefs<MicSource>(MIC_PREF, "ipad"), () => "ipad" as MicSource);
}
function setMicSource(m: MicSource) {
  gameStore.setPref(MIC_PREF, m);
  window.dispatchEvent(new Event("sd-mic"));
}

/** Whether my phone is in the room as my camera. */
export function useMyPhone() {
  const { meId } = useContext(Video);
  const participants = useParticipants();
  return participants.some((p) => p.identity === cameraIdentity(meId));
}

/**
 * Applies the chosen mic: the iPad publishes its own, or tells the phone (via a
 * participant attribute the phone watches) to send its mic instead.
 */
function MicSync() {
  const source = useMicSource();
  const phone = useMyPhone();
  const { localParticipant } = useLocalParticipant();
  // Falls back to the iPad mic while the phone isn't there, so you're never silently muted.
  const effective: MicSource = source === "phone" && !phone ? "ipad" : source;

  useEffect(() => {
    if (!localParticipant) return;
    void localParticipant.setMicrophoneEnabled(effective === "ipad").catch(() => {});
    void localParticipant.setAttributes({ [MIC_ATTRIBUTE]: effective }).catch(() => {});
  }, [effective, localParticipant]);
  return null;
}

/** Voice source, "Add camera", and "tap for sound" when the browser blocks audio. */
export function MediaControls({ compact = false }: { compact?: boolean }) {
  const on = useVideoOn();
  if (!on) return null;
  return <Controls compact={compact} />;
}

function Controls({ compact }: { compact: boolean }) {
  const { canPlayAudio, startAudio } = useAudioPlayback();
  const { isMicrophoneEnabled } = useLocalParticipant();
  const source = useMicSource();
  const phone = useMyPhone();
  const { meId, voice } = useContext(Video);
  // The phone being in the room isn't enough: it may still be asking for camera permission, or have none.
  const picture = !!useCamera(meId);
  const [camOpen, setCamOpen] = useState(false);
  const [micOpen, setMicOpen] = useState(false);

  const micLive = source === "phone" ? phone : source === "ipad" && isMicrophoneEnabled;
  const micLabel = source === "off" ? "Muted" : source === "phone" ? (phone ? "iPhone mic" : "iPad mic") : "iPad mic";
  const btn = "flex h-11 items-center justify-center gap-2 rounded-xl px-3 font-medium transition";

  return (
    <div className="flex items-center gap-2">
      {!canPlayAudio && (
        <button type="button" onClick={() => void startAudio()} className={`${btn} bg-brass text-ink`}>
          Tap for sound
        </button>
      )}
      {voice && (
        <button
          type="button"
          onClick={() => setMicOpen(true)}
          aria-label={`Microphone: ${micLabel}`}
          className={`${btn} ${micLive ? "bg-chalk text-ink" : "bg-cabinet text-dim hover:text-chalk"}`}
        >
          <MicIcon off={!micLive} />
          {!compact && <span>{micLabel}</span>}
        </button>
      )}
      <button
        type="button"
        onClick={() => setCamOpen(true)}
        aria-label={picture ? "Camera on" : phone ? "Phone connected, no picture yet" : "Add a camera"}
        className={`${btn} ${picture ? "bg-treble/20 text-treble" : phone ? "bg-brass/20 text-brass" : "bg-cabinet text-dim hover:text-chalk"}`}
      >
        <CamIcon off={!picture} />
        {!compact && <span>{picture ? "Camera on" : phone ? "Check the phone" : "Add camera"}</span>}
      </button>

      <Sheet open={micOpen} onClose={() => setMicOpen(false)} label="Microphone">
        <MicPicker phone={phone} onDone={() => setMicOpen(false)} />
      </Sheet>
      <Sheet open={camOpen} onClose={() => setCamOpen(false)} label="Camera">
        {camOpen && <CameraPairing phone={phone} picture={picture} onDone={() => setCamOpen(false)} />}
      </Sheet>
    </div>
  );
}

function MicPicker({ phone, onDone }: { phone: boolean; onDone: () => void }) {
  const source = useMicSource();
  const options: { value: MicSource; label: string; hint: string; disabled?: boolean }[] = [
    { value: "ipad", label: "iPad", hint: "Best for talking. The iPad cancels its own speaker, so nobody hears an echo." },
    {
      value: "phone",
      label: "iPhone",
      hint: phone
        ? "Picks up the darts landing. Keep the iPad's volume low, or your friends hear themselves through it."
        : "Connect your phone as a camera first.",
      disabled: !phone,
    },
    { value: "off", label: "Off", hint: "You can still hear everyone." },
  ];
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-3xl font-bold">Your microphone</h2>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Microphone">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={source === o.value}
            disabled={o.disabled}
            onClick={() => {
              setMicSource(o.value);
              onDone();
            }}
            className={`flex flex-col rounded-2xl border-2 p-4 text-left transition disabled:opacity-40 ${
              source === o.value ? "border-chalk bg-felt" : "border-transparent bg-ink hover:bg-felt"
            }`}
          >
            <span className="text-lg font-semibold">{o.label}</span>
            <span className="text-sm text-dim">{o.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** QR code for the phone. Scanning it joins the room as this player's camera, no sign-in. */
export function CameraPairing({ phone, picture, onDone }: { phone: boolean; picture: boolean; onDone: () => void }) {
  const { link: makeLink } = useContext(Video);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    makeLink()
      .then((r) => {
        if (!live) return;
        if (r.ok) setLink(`${window.location.origin}${r.path}`);
        else setError(r.error === "video_unavailable" ? "Video isn't set up on the server." : r.error);
      })
      .catch(() => live && setError("Couldn't reach the server. Check your connection and try again."));
    return () => {
      live = false;
    };
    // Made once per opening of the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phone) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-3xl font-bold">{picture ? "Camera connected" : "Phone connected"}</h2>
        <p className="text-dim">
          {picture
            ? "Your phone is sending the board. To change the angle, just move the phone. Close the page on the phone to stop."
            : "The phone joined but isn't sending a picture yet. Look at the phone: it may be asking for camera permission."}
        </p>
        <button type="button" onClick={onDone} className="h-14 rounded-2xl bg-chalk font-display text-xl font-bold text-ink">
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-3xl font-bold">Use your phone as the camera</h2>
      <div className="grid items-center gap-5 sm:grid-cols-[auto_1fr]">
        <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-2xl bg-chalk p-3 text-ink">
          {link ? (
            // uqr returns a self-contained SVG for the link we just made.
            <div aria-label="QR code" role="img" className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: renderSVG(link, { border: 1 }) }} />
          ) : (
            <span className="text-sm">{error ? "No code" : "Making a code…"}</span>
          )}
        </div>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-dim">
          <li>Open the Camera app on your iPhone and point it at the code.</li>
          <li>Tap the link. No sign-in needed; it&apos;s good for 12 hours.</li>
          <li>Stand the phone where it sees the whole board, side-on works best.</li>
        </ol>
      </div>
      {error && (
        <p role="alert" className="text-double">
          {error}
        </p>
      )}
      {link && (
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard.writeText(link).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            })
          }
          className="h-12 rounded-2xl bg-felt font-semibold hover:bg-wire"
        >
          {copied ? "Copied" : "Copy camera link instead"}
        </button>
      )}
      <p className="text-center text-sm text-dim">This switches to &ldquo;Camera connected&rdquo; as soon as the phone joins.</p>
    </div>
  );
}

function useCamera(playerId: string): TrackReference | null {
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: true });
  return (tracks.find((t) => identityPlayer(t.participant.identity) === playerId && !t.publication.isMuted) as TrackReference | undefined) ?? null;
}

/** Whether this player's board camera is live right now. */
export function useHasCamera(playerId: string) {
  const on = useVideoOn();
  const cam = useCamera(playerId);
  return on && !!cam;
}

/** One player's board camera, or their avatar when there isn't one. */
export function VideoTile({ player, self = false, className = "", children }: { player: GamePlayer; self?: boolean; className?: string; children?: ReactNode }) {
  const cam = useCamera(player.id);
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-ink ${className}`}>
      {cam ? (
        <VideoTrack trackRef={cam} className="absolute inset-0 h-full w-full object-contain" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-felt">
          <Avatar name={player.name} color={player.color} url={player.avatarUrl} size={56} />
        </div>
      )}
      <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-ink/70 px-2 py-0.5 text-sm font-medium backdrop-blur">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: player.color }} />
        {self ? "Your board" : player.name.split(" ")[0]}
      </span>
      {children}
    </div>
  );
}

/** Small tiles for everyone whose camera is on. Renders nothing when nobody's is. */
export function VideoStrip({ players, meId, className = "" }: { players: GamePlayer[]; meId: string; className?: string }) {
  const on = useVideoOn();
  if (!on) return null;
  return <Strip players={players} meId={meId} className={className} />;
}

function Strip({ players, meId, className }: { players: GamePlayer[]; meId: string; className: string }) {
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: true });
  const live = players.filter((p) => tracks.some((t) => identityPlayer(t.participant.identity) === p.id && !t.publication.isMuted));
  if (live.length === 0) return null;
  return (
    <div className={`flex gap-2 ${className}`}>
      {live.map((p) => (
        <VideoTile key={p.id} player={p} self={p.id === meId} className="aspect-video h-full shrink-0" />
      ))}
    </div>
  );
}

export function MicIcon({ off }: { off: boolean }) {
  return (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

export function CamIcon({ off }: { off: boolean }) {
  return (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}
