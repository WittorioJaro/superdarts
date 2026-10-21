"use client";

import {
  LiveKitRoom,
  useConnectionState,
  useLocalParticipant,
  useParticipantAttributes,
  useRemoteParticipant,
} from "@livekit/components-react";
import { ConnectionState, type LocalVideoTrack, Track, VideoPresets, createLocalVideoTrack } from "livekit-client";
import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from "react";
import { cameraToken } from "@/app/online-actions";
import { CamIcon, MicIcon } from "@/components/room-video";
import { MIC_ATTRIBUTE, type CameraSession } from "@/lib/friends-types";
import type { Calibration } from "@/lib/vision/calibration";
import { BoardLines, Calibrator, saveCalibration, savedCalibration, useBoardScorer } from "./scorer";

type Facing = "user" | "environment";

const Logo = createContext<ReactNode>(null);

export function CameraClient({ token, logo }: { token: string; logo: ReactNode }) {
  return (
    <Logo.Provider value={logo}>
      <Camera token={token} />
    </Logo.Provider>
  );
}

function Camera({ token }: { token: string }) {
  const [session, setSession] = useState<CameraSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    let live = true;
    cameraToken(token)
      .then((r) => {
        if (!live) return;
        if (r.ok) setSession(r);
        else setError(r.error === "video_unavailable" ? "Video isn't set up on the server." : r.error);
      })
      .catch(() => live && setError("Couldn't reach Superdarts. Check the phone's connection and scan again."));
    return () => {
      live = false;
    };
  }, [token]);

  if (error) return <Message title="Can't connect the camera" body={error} />;
  if (!session) return <Message title="Connecting…" body="Checking the camera link." />;
  if (ended) {
    return (
      <Message title="Camera stopped" body="The connection to the room ended.">
        <button type="button" onClick={() => window.location.reload()} className="h-14 rounded-2xl bg-chalk px-8 font-display text-xl font-bold text-ink">
          Reconnect
        </button>
      </Message>
    );
  }
  if (!started) {
    return (
      <Message title={`${session.player.name.split(" ")[0]}'s board camera`} body={session.roomCode ? `For room ${session.roomCode}. Friends will see what this phone sees.` : "Scores your darts on the iPad. The picture stays on this phone."}>
        <button
          type="button"
          onClick={() => setStarted(true)}
          className="h-16 w-full max-w-xs rounded-2xl bg-double font-display text-2xl font-bold transition active:scale-[0.98]"
        >
          Start camera
        </button>
        <p className="max-w-xs text-sm text-dim">Stand the phone where it sees the whole board. Landscape gives the widest view.</p>
      </Message>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={session.url}
      token={session.token}
      connect
      audio={false}
      video={false}
      // The phone only sends; it never needs to receive anyone's video or audio.
      connectOptions={{ autoSubscribe: false }}
      options={{
        adaptiveStream: false,
        dynacast: true,
        publishDefaults: { videoSimulcastLayers: [VideoPresets.h360, VideoPresets.h180] },
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: false, autoGainControl: true },
      }}
      onDisconnected={() => setEnded(true)}
      className="contents"
    >
      <Live session={session} />
    </LiveKitRoom>
  );
}

const STATE_LABEL: Record<string, string> = {
  off: "Starting…",
  waiting: "Getting a clear view of the board",
  watching: "Watching for darts",
  motion: "Something's moving",
  settling: "Looking…",
};

function Live({ session }: { session: CameraSession }) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const state = useConnectionState();
  const ipad = useRemoteParticipant(session.player.id);
  const { attributes } = useParticipantAttributes({ participant: ipad });
  // A local game only needs the darts, so the picture never leaves the phone.
  const solo = session.roomCode === null;
  const [facing, setFacing] = useState<Facing>("environment");
  const [track, setTrack] = useState<LocalVideoTrack | null>(null);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const mic = attributes?.[MIC_ATTRIBUTE];
  const wantMic = mic === "phone";
  const [camError, setCamError] = useState<string | null>(null);
  const connected = state === ConnectionState.Connected;
  const scorer = useBoardScorer(calibrating ? null : video, session.player.id, calibration);

  // Started by hand rather than by LiveKitRoom, so a missing or blocked camera shows up here instead of hanging.
  const startCamera = useCallback(async () => {
    setCamError(null);
    try {
      const t = await createLocalVideoTrack({ facingMode: facing, resolution: VideoPresets.h720.resolution });
      if (!solo) await localParticipant.publishTrack(t, { source: Track.Source.Camera });
      setTrack(t);
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      setCamError(
        name === "NotAllowedError"
          ? "Safari isn't allowed to use the camera. Allow it in Settings → Safari → Camera, then try again."
          : name === "NotFoundError"
            ? "This device has no camera Safari can use."
            : "The camera didn't start. Close other apps using it and try again.",
      );
    }
  }, [localParticipant, facing, solo]);

  useEffect(() => {
    // Runs once per connection; facing changes go through restartTrack in flip().
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (connected && !track) void startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);
  useEffect(() => () => track?.stop(), [track]);

  useEffect(() => {
    if (!track || !video) return;
    track.attach(video);
    const measure = () => video.videoWidth && setSize((s) => (s?.width === video.videoWidth && s.height === video.videoHeight ? s : { width: video.videoWidth, height: video.videoHeight }));
    video.addEventListener("loadedmetadata", measure);
    video.addEventListener("resize", measure);
    return () => {
      video.removeEventListener("loadedmetadata", measure);
      video.removeEventListener("resize", measure);
      track.detach(video);
    };
  }, [track, video]);

  // A calibration only fits the resolution it was made at; flipping cameras or rotating needs a new one.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCalibration(savedCalibration(session.player.id, size));
  }, [session.player.id, size]);

  // The iPad decides which device carries this player's voice.
  useEffect(() => {
    if (state !== ConnectionState.Connected) return;
    localParticipant.setMicrophoneEnabled(wantMic).catch(() => setProblem("Allow the microphone for this site in Settings → Safari."));
  }, [wantMic, state, localParticipant]);

  useWakeLock();

  async function flip() {
    const next: Facing = facing === "environment" ? "user" : "environment";
    try {
      await track?.restartTrack({ facingMode: next, resolution: VideoPresets.h720.resolution });
      setFacing(next);
    } catch {
      setProblem("Couldn't switch cameras.");
    }
  }

  const live = connected && !!track;
  const mirrored = facing === "user";

  return (
    <main className="locked fixed inset-0 flex flex-col bg-black">
      {track ? (
        <>
          <video ref={setVideo} muted playsInline autoPlay className={`absolute inset-0 h-full w-full object-contain ${mirrored ? "-scale-x-100" : ""}`} />
          {calibration && size && !calibrating && (
            <svg
              aria-hidden
              viewBox={`0 0 ${size.width} ${size.height}`}
              preserveAspectRatio="xMidYMid meet"
              className={`pointer-events-none absolute inset-0 h-full w-full ${mirrored ? "-scale-x-100" : ""}`}
            >
              <BoardLines calibration={calibration} faint />
            </svg>
          )}
          {scorer.last && !calibrating && (
            <span
              key={scorer.last.id}
              className="animate-pop pointer-events-none absolute inset-x-0 top-1/3 mx-auto w-fit rounded-3xl bg-ink/85 px-8 py-3 font-display text-7xl font-extrabold"
            >
              {scorer.last.label}
            </span>
          )}
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-dim">
          {camError ? (
            <div className="flex flex-col items-center gap-4">
              <p className="max-w-sm text-lg text-chalk">{camError}</p>
              <button type="button" onClick={() => void startCamera()} className="h-14 rounded-2xl bg-chalk px-8 font-display text-xl font-bold text-ink">
                Try again
              </button>
            </div>
          ) : connected ? (
            "Starting the camera… If Safari asks, allow it."
          ) : (
            "Connecting…"
          )}
        </div>
      )}

      {calibrating && video && size ? (
        <Calibrator
          video={video}
          mirrored={mirrored}
          onCancel={() => setCalibrating(false)}
          onDone={(c) => {
            saveCalibration(session.player.id, c);
            setCalibration(c);
            setCalibrating(false);
          }}
        />
      ) : (
        <>
          <div className="safe-top relative flex items-start justify-between gap-3 px-4">
            <span className={`flex items-center gap-2 rounded-full px-4 py-2 font-semibold backdrop-blur ${live ? "bg-double/90" : "bg-ink/70 text-dim"}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${live ? "animate-pulse bg-chalk" : "bg-dim"}`} />
              {live ? (solo ? "Connected" : "Live") : state === ConnectionState.Reconnecting ? "Reconnecting…" : "Connecting…"}
            </span>
            <span className="rounded-full bg-ink/70 px-4 py-2 text-sm font-medium backdrop-blur">
              {session.roomCode ? `Room ${session.roomCode}` : "Local game"} · {session.player.name.split(" ")[0]}&apos;s board
            </span>
          </div>

          <div className="safe-bottom relative mt-auto flex flex-col gap-3 px-4">
            {track && size && (
              <div className="flex items-center gap-3">
                {calibration ? (
                  <>
                    <span className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-ink/75 px-4 py-3 font-medium backdrop-blur">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${scorer.state === "watching" ? "bg-treble" : "bg-brass"}`} />
                      <span className="truncate">{STATE_LABEL[scorer.state]}</span>
                    </span>
                    <button type="button" onClick={() => setCalibrating(true)} className="h-12 shrink-0 rounded-2xl bg-ink/75 px-4 font-semibold backdrop-blur">
                      Redo setup
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCalibrating(true)}
                    className="h-14 flex-1 rounded-2xl bg-brass font-display text-xl font-bold text-ink transition active:scale-[0.98]"
                  >
                    Set up scoring
                  </button>
                )}
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <span
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium backdrop-blur ${isMicrophoneEnabled ? "bg-chalk text-ink" : "bg-ink/70 text-dim"}`}
              >
                <MicIcon off={!isMicrophoneEnabled} />
                {isMicrophoneEnabled ? "Mic on" : solo || mic === "off" ? "Mic off" : "Mic on the iPad"}
              </span>
              <button
                type="button"
                onClick={() => void flip()}
                className="flex h-14 items-center gap-2 rounded-full bg-ink/70 px-5 font-semibold backdrop-blur active:scale-[0.97]"
              >
                <CamIcon off={false} />
                {facing === "environment" ? "Use front camera" : "Use back camera"}
              </button>
            </div>
          </div>
        </>
      )}
      {problem && track && (
        <p role="alert" className="absolute inset-x-4 bottom-40 rounded-2xl bg-double px-4 py-3 text-center font-medium">
          {problem}
        </p>
      )}
    </main>
  );
}

/** Keeps the phone's screen on; iOS would otherwise lock it and stop the camera. */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const take = () => {
      if (document.visibilityState !== "visible" || !("wakeLock" in navigator)) return;
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          lock = l;
        })
        .catch(() => {});
    };
    take();
    document.addEventListener("visibilitychange", take);
    return () => {
      document.removeEventListener("visibilitychange", take);
      void lock?.release().catch(() => {});
    };
  }, []);
}

function Message({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <main className="locked safe-top safe-bottom fixed inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center">
      {useContext(Logo)}
      <h1 className="font-display text-4xl font-extrabold">{title}</h1>
      <p className="max-w-sm text-lg text-dim">{body}</p>
      {children}
    </main>
  );
}
