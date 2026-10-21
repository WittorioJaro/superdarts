"use client";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  type TrackReferenceOrPlaceholder,
  VideoTrack,
  useAudioPlayback,
  useLocalParticipant,
  useTracks,
} from "@livekit/components-react";
import { type LocalVideoTrack, Track } from "livekit-client";
import { type ReactNode, createContext, useContext, useEffect, useState } from "react";
import { videoToken } from "@/app/online-actions";
import { Avatar } from "@/components/ui";
import { type GamePlayer, gameStore } from "@/lib/game-store";

/**
 * Camera and voice for a room, through LiveKit. Everything here is optional:
 * without LiveKit keys, or with the camera off, the room works the same.
 */

type Facing = "user" | "environment";
type VideoPrefs = { mic: boolean; cam: boolean; facing: Facing };
const PREFS: VideoPrefs = { mic: false, cam: false, facing: "user" };

const VideoOn = createContext(false);

export function RoomVideo({ roomId, children }: { roomId: string; children: ReactNode }) {
  const [creds, setCreds] = useState<{ url: string; token: string } | null>(null);

  useEffect(() => {
    let live = true;
    videoToken(roomId)
      .then((r) => live && r.ok && setCreds({ url: r.url, token: r.token }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [roomId]);

  // Always rendered, so the room's UI doesn't remount when the token arrives.
  return (
    <LiveKitRoom
      serverUrl={creds?.url}
      token={creds?.token}
      connect={!!creds}
      audio={false}
      video={false}
      options={{ adaptiveStream: true, dynacast: true }}
      className="contents"
    >
      <VideoOn.Provider value={!!creds}>
        {children}
        {creds && <Restore />}
        {creds && <RoomAudioRenderer />}
      </VideoOn.Provider>
    </LiveKitRoom>
  );
}

export function useVideoOn() {
  return useContext(VideoOn);
}

/** Turn the camera and mic back on if they were on last time. */
function Restore() {
  const { localParticipant } = useLocalParticipant();
  useEffect(() => {
    const p = gameStore.prefs<VideoPrefs>("video", PREFS);
    const id = setTimeout(() => {
      if (p.mic) void localParticipant.setMicrophoneEnabled(true).catch(() => {});
      if (p.cam) void localParticipant.setCameraEnabled(true, { facingMode: p.facing }).catch(() => {});
    }, 300);
    return () => clearTimeout(id);
  }, [localParticipant]);
  return null;
}

function savePrefs(patch: Partial<VideoPrefs>) {
  gameStore.setPref("video", { ...gameStore.prefs<VideoPrefs>("video", PREFS), ...patch });
}

/** Mic, camera and flip buttons, plus "tap for sound" when the browser blocks audio. */
export function MediaControls({ compact = false }: { compact?: boolean }) {
  const on = useVideoOn();
  if (!on) return null;
  return <Controls compact={compact} />;
}

function Controls({ compact }: { compact: boolean }) {
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const { canPlayAudio, startAudio } = useAudioPlayback();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      setError(null);
    } catch {
      setError("Allow the camera and microphone for Superdarts in Settings, then try again.");
    } finally {
      setBusy(false);
    }
  }

  const toggleMic = () =>
    run(async () => {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
      savePrefs({ mic: !isMicrophoneEnabled });
    });
  const toggleCam = () =>
    run(async () => {
      const facing = gameStore.prefs<VideoPrefs>("video", PREFS).facing;
      await localParticipant.setCameraEnabled(!isCameraEnabled, { facingMode: facing });
      savePrefs({ cam: !isCameraEnabled });
    });
  const flip = () =>
    run(async () => {
      const facing: Facing = gameStore.prefs<VideoPrefs>("video", PREFS).facing === "user" ? "environment" : "user";
      const track = localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack as LocalVideoTrack | undefined;
      await track?.restartTrack({ facingMode: facing });
      savePrefs({ facing });
    });

  const btn = `flex items-center justify-center gap-2 rounded-xl font-medium transition disabled:opacity-40 ${compact ? "h-10 w-10" : "h-12 px-4"}`;

  return (
    <div className="flex items-center gap-2">
      {!canPlayAudio && (
        <button type="button" onClick={() => void startAudio()} className={`${btn} h-10 bg-brass px-3 text-ink ${compact ? "w-auto" : ""}`}>
          Tap for sound
        </button>
      )}
      <button
        type="button"
        onClick={toggleMic}
        disabled={busy}
        aria-pressed={isMicrophoneEnabled}
        aria-label={isMicrophoneEnabled ? "Mute microphone" : "Turn on microphone"}
        className={`${btn} ${isMicrophoneEnabled ? "bg-chalk text-ink" : "bg-cabinet text-dim hover:text-chalk"}`}
      >
        <MicIcon off={!isMicrophoneEnabled} />
        {!compact && <span>{isMicrophoneEnabled ? "Mic on" : "Mic off"}</span>}
      </button>
      <button
        type="button"
        onClick={toggleCam}
        disabled={busy}
        aria-pressed={isCameraEnabled}
        aria-label={isCameraEnabled ? "Turn off camera" : "Turn on camera"}
        className={`${btn} ${isCameraEnabled ? "bg-chalk text-ink" : "bg-cabinet text-dim hover:text-chalk"}`}
      >
        <CamIcon off={!isCameraEnabled} />
        {!compact && <span>{isCameraEnabled ? "Camera on" : "Camera off"}</span>}
      </button>
      {isCameraEnabled && (
        <button type="button" onClick={flip} disabled={busy} aria-label="Switch camera" className={`${btn} bg-cabinet text-dim hover:text-chalk`}>
          <FlipIcon />
          {!compact && <span>Switch</span>}
        </button>
      )}
      {error && (
        <p role="alert" className="max-w-56 text-sm text-double">
          {error}
        </p>
      )}
    </div>
  );
}

function useCamera(playerId: string): TrackReferenceOrPlaceholder | null {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }], { onlySubscribed: false });
  return tracks.find((t) => t.participant.identity === playerId && t.publication && !t.publication.isMuted) ?? null;
}

/** Whether this player is showing their camera right now. */
export function useHasCamera(playerId: string) {
  const on = useVideoOn();
  const cam = useCamera(playerId);
  return on && !!cam;
}

/** One player's camera, or their avatar when it's off. */
export function VideoTile({ player, self = false, className = "", children }: { player: GamePlayer; self?: boolean; className?: string; children?: ReactNode }) {
  const cam = useCamera(player.id);
  const mirrored = self && gameStore.prefs<VideoPrefs>("video", PREFS).facing === "user";
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-ink ${className}`}>
      {cam?.publication ? (
        <VideoTrack trackRef={cam as never} className={`absolute inset-0 h-full w-full object-cover ${mirrored ? "-scale-x-100" : ""}`} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-felt">
          <Avatar name={player.name} color={player.color} url={player.avatarUrl} size={56} />
        </div>
      )}
      <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-ink/70 px-2 py-0.5 text-sm font-medium backdrop-blur">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: player.color }} />
        {self ? "You" : player.name.split(" ")[0]}
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
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: false }], { onlySubscribed: false });
  const live = players.filter((p) => tracks.some((t) => t.participant.identity === p.id && t.publication && !t.publication.isMuted));
  if (live.length === 0) return null;
  return (
    <div className={`flex gap-2 ${className}`}>
      {live.map((p) => (
        <VideoTile key={p.id} player={p} self={p.id === meId} className="aspect-video h-full" />
      ))}
    </div>
  );
}

function MicIcon({ off }: { off: boolean }) {
  return (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}

function CamIcon({ off }: { off: boolean }) {
  return (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}

function FlipIcon() {
  return (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5" />
    </svg>
  );
}
