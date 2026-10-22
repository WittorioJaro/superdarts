"use client";

import { useLocalParticipant, useMaybeRoomContext } from "@livekit/components-react";
import { ConnectionState, type RemoteParticipant, RoomEvent } from "livekit-client";
import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { dartLabel } from "@/lib/darts/board";
import { applyBias, createBias, learnCorrection, restoreBias } from "@/lib/vision/bias";
import { type Calibration, CalibrationError, type CalibrationPoints, createCalibration, overlayGeometry, restoreCalibration } from "@/lib/vision/calibration";
import { DartDetector, type DetectorState } from "@/lib/vision/detector";
import type { Point } from "@/lib/vision/homography";
import { BoardRectifier, LumaProcessor } from "@/lib/vision/luma";
import { type PhoneMessage, VISION_TOPIC, decodeMessage, encodeMessage } from "@/lib/vision/protocol";
import { scoreDistribution, topSuggestions } from "@/lib/vision/score";

/** Frames per second the detector looks at. Darts settle in a fraction of a second; more only drains the battery. */
const FPS = 12;
const WIDTH = 320;

// Per camera: the front and back cameras usually share a resolution but never a view of the board.
const calKey = (playerId: string, camera: string) => `sd-vision-cal:${playerId}:${camera}`;
const biasKey = (playerId: string) => `sd-vision-bias:${playerId}`;

function load<T>(key: string, restore: (v: unknown) => T | null): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? restore(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** The saved calibration for this camera, if it was made at this resolution. */
export function savedCalibration(playerId: string, camera: string, size: { width: number; height: number } | null) {
  const cal = load(calKey(playerId, camera), restoreCalibration);
  return cal && size && cal.imageSize.width === size.width && cal.imageSize.height === size.height ? cal : null;
}

export function saveCalibration(playerId: string, camera: string, cal: Calibration | null) {
  try {
    if (cal) localStorage.setItem(calKey(playerId, camera), JSON.stringify(cal));
    else localStorage.removeItem(calKey(playerId, camera));
    // A new camera position makes the old correction offset meaningless.
    localStorage.removeItem(biasKey(playerId));
  } catch {
    // Private mode: works for this session only.
  }
}

export interface ScorerState {
  state: DetectorState | "off";
  /** The last dart seen, shown big on the phone for a moment. */
  last: { label: string; id: string } | null;
}

/**
 * Watches the video for darts and tells the iPad (`playerId` in the LiveKit room) what it saw.
 * The iPad answers with corrections, which nudge a learned offset, and visit/reset hints.
 */
export function useBoardScorer(video: HTMLVideoElement | null, playerId: string, calibration: Calibration | null): ScorerState {
  const room = useMaybeRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [state, setState] = useState<ScorerState>({ state: "off", last: null });
  // Outlives a rebuild (redoing setup, a reconnect), so corrections for darts already sent still teach the phone.
  const rawPoints = useRef(new Map<string, { x: number; y: number }>());
  const running = !!video && !!calibration && !!room;

  // While nothing is being watched, still tell the iPad the phone is here and needs setting up.
  useEffect(() => {
    if (running || !room) return;
    const bytes = encodeMessage({ v: 1, kind: "status", calibrated: false, state: "waiting", fps: 0 });
    if (!bytes) return;
    const ping = () => {
      if (room.state !== ConnectionState.Connected) return;
      void localParticipant.publishData(new Uint8Array(bytes), { reliable: true, topic: VISION_TOPIC, destinationIdentities: [playerId] }).catch(() => {});
    };
    ping();
    const id = window.setInterval(ping, 2000);
    return () => clearInterval(id);
  }, [running, room, localParticipant, playerId]);

  useEffect(() => {
    if (!video || !calibration || !room) return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    let w = 0, h = 0;
    let luma: LumaProcessor, warp: BoardRectifier, detector: DartDetector;
    let bias = load(biasKey(playerId), restoreBias) ?? createBias();
    const raw = rawPoints.current;
    const session = Math.random().toString(36).slice(2, 8);
    let frames = 0, fps = 0, lastTick = performance.now(), lastFrame = 0, handle = 0, stopped = false;

    const send = (m: PhoneMessage) => {
      // LiveKit remembers a failed first attempt to open the data channel and fails every send after it,
      // so nothing may be sent before the room has connected.
      if (room.state !== ConnectionState.Connected) return;
      const bytes = encodeMessage(m);
      if (bytes) void localParticipant.publishData(new Uint8Array(bytes), { reliable: true, topic: VISION_TOPIC, destinationIdentities: [playerId] }).catch(() => {});
    };

    const setup = () => {
      w = WIDTH;
      h = Math.round((WIDTH * video.videoHeight) / video.videoWidth);
      canvas.width = w;
      canvas.height = h;
      luma = new LumaProcessor(WIDTH);
      warp = new BoardRectifier(calibration, { width: w, height: h });
      detector = new DartDetector({ width: warp.frame.width, height: warp.frame.height, frameToBoard: warp.frameToBoard, frameToImage: warp.frameToImage, idPrefix: session });
    };

    const tick = (now: number) => {
      if (stopped) return;
      schedule();
      if (now - lastFrame < 1000 / FPS || video.readyState < 2 || !video.videoWidth) return;
      lastFrame = now;
      if (!detector || Math.round((WIDTH * video.videoHeight) / video.videoWidth) !== h) setup();
      ctx.drawImage(video, 0, 0, w, h);
      const ev = detector.process(warp.process(luma.process(ctx.getImageData(0, 0, w, h))), now);
      frames++;
      if (ev?.kind === "dart") {
        raw.set(ev.id, ev.board);
        if (raw.size > 30) raw.delete(raw.keys().next().value!);
        const p = applyBias(bias, ev.board, ev.sigma);
        const candidates = topSuggestions(scoreDistribution(p.board, p.sigma), 6);
        send({ v: 1, kind: "dart", id: ev.id, at: Date.now(), board: p.board, sigma: Math.min(2, Math.max(1e-4, p.sigma)), candidates });
        setState({ state: detector.state, last: { label: dartLabel(candidates[0].dart), id: ev.id } });
      } else if (ev?.kind === "takeout") {
        send({ v: 1, kind: "takeout", at: Date.now() });
      }
    };
    // Video frame callbacks fire only when there's a new frame; timers are the fallback.
    const schedule = () => {
      handle = "requestVideoFrameCallback" in video ? video.requestVideoFrameCallback(tick) : window.setTimeout(() => tick(performance.now()), 1000 / FPS);
    };
    schedule();

    const status = window.setInterval(() => {
      const now = performance.now();
      fps = Math.round((frames * 1000) / (now - lastTick));
      frames = 0;
      lastTick = now;
      const s = detector?.state ?? "waiting";
      send({ v: 1, kind: "status", calibrated: true, state: s, fps: Math.min(240, fps) });
      setState((prev) => (prev.state === s ? prev : { ...prev, state: s }));
    }, 2000);

    const onData = (payload: Uint8Array, from?: RemoteParticipant, _kind?: unknown, topic?: string) => {
      if (topic !== VISION_TOPIC || from?.identity !== playerId) return;
      const m = decodeMessage(payload);
      if (!m || !detector) return;
      if (m.kind === "reset") detector.reset();
      else if (m.kind === "visit") detector.visit();
      else if (m.kind === "correction") {
        const point = raw.get(m.id);
        if (!point) return;
        raw.delete(m.id);
        bias = learnCorrection(bias, point, m.dart);
        try {
          localStorage.setItem(biasKey(playerId), JSON.stringify(bias));
        } catch {}
      }
    };
    room.on(RoomEvent.DataReceived, onData);

    return () => {
      stopped = true;
      if ("cancelVideoFrameCallback" in video) video.cancelVideoFrameCallback(handle);
      clearTimeout(handle);
      clearInterval(status);
      room.off(RoomEvent.DataReceived, onData);
      setState({ state: "off", last: null });
    };
  }, [video, calibration, room, localParticipant, playerId]);

  return state;
}

/** Where to tap, in order: the outer double wire at the middle of 20, 6, 3 and 11, then the bull. */
const STEPS: { key: keyof CalibrationPoints; title: string }[] = [
  { key: "top", title: "the top of the 20" },
  { key: "right", title: "the right of the 6" },
  { key: "bottom", title: "the bottom of the 3" },
  { key: "left", title: "the left of the 11" },
  { key: "bull", title: "the middle of the bull" },
];

/**
 * Tap five points on the live picture. Taps are mapped from the screen into video pixels,
 * allowing for letterboxing and a mirrored front camera. Ends with the board drawn on top to check.
 */
export function Calibrator({
  video,
  mirrored,
  onDone,
  onCancel,
}: {
  video: HTMLVideoElement;
  mirrored: boolean;
  onDone: (c: Calibration) => void;
  onCancel: () => void;
}) {
  const [points, setPoints] = useState<Partial<CalibrationPoints>>({});
  const [error, setError] = useState<string | null>(null);
  const size = { width: video.videoWidth, height: video.videoHeight };
  const step = STEPS.findIndex((s) => !points[s.key]);
  const result = useMemo(() => {
    if (step !== -1) return null;
    try {
      return createCalibration(points as CalibrationPoints, size);
    } catch (e) {
      return e instanceof CalibrationError ? e.reason : "Those taps don't make a board. Try again.";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, points]);
  const ref = useRef<SVGSVGElement>(null);

  function tap(e: PointerEvent<SVGSVGElement>) {
    if (step === -1) return;
    // Undo the video's object-contain letterboxing by hand: browsers disagree on whether
    // getScreenCTM includes the CSS mirror used for the front camera.
    const box = ref.current!.getBoundingClientRect();
    const scale = Math.min(box.width / size.width, box.height / size.height);
    const x = (e.clientX - box.left - (box.width - size.width * scale) / 2) / scale;
    const p: Point = { x: mirrored ? size.width - x : x, y: (e.clientY - box.top - (box.height - size.height * scale) / 2) / scale };
    if (p.x < 0 || p.y < 0 || p.x > size.width || p.y > size.height) return;
    setError(null);
    setPoints((ps) => ({ ...ps, [STEPS[step].key]: p }));
  }

  const calibration = typeof result === "object" ? result : null;
  const problem = typeof result === "string" ? result : error;

  return (
    <div className="absolute inset-0 z-10 flex flex-col">
      <svg
        ref={ref}
        viewBox={`0 0 ${size.width} ${size.height}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={tap}
        className={`absolute inset-0 h-full w-full ${mirrored ? "-scale-x-100" : ""}`}
      >
        {calibration && <BoardLines calibration={calibration} />}
        {STEPS.map((s) => {
          const p = points[s.key];
          return p && <circle key={s.key} cx={p.x} cy={p.y} r={size.width / 90} fill="var(--color-brass)" stroke="black" strokeWidth={size.width / 400} />;
        })}
      </svg>

      <div className="safe-top pointer-events-none relative mx-4 mt-16 rounded-2xl bg-ink/85 p-4 text-center backdrop-blur">
        {step !== -1 ? (
          <>
            <p className="text-sm text-dim">Set up scoring · {step + 1} of 5</p>
            <p className="text-xl font-semibold">
              {step < 4 ? (
                <>
                  Tap the outer edge of the double ring at <span className="text-brass">{STEPS[step].title}</span>
                </>
              ) : (
                <>
                  Tap <span className="text-brass">{STEPS[step].title}</span>
                </>
              )}
            </p>
          </>
        ) : calibration ? (
          <p className="text-xl font-semibold">Do the lines sit on the board&apos;s wires?</p>
        ) : (
          <p className="text-xl font-semibold text-double">{problem}</p>
        )}
      </div>

      <div className="safe-bottom relative mt-auto flex gap-3 px-4">
        <button type="button" onClick={onCancel} className="h-14 rounded-2xl bg-ink/80 px-5 font-semibold backdrop-blur">
          Cancel
        </button>
        {step !== 0 && (
          <button
            type="button"
            onClick={() => {
              const last = [...STEPS].reverse().find((s) => points[s.key]);
              if (last) setPoints((ps) => ({ ...ps, [last.key]: undefined }));
            }}
            className="h-14 flex-1 rounded-2xl bg-ink/80 font-semibold backdrop-blur"
          >
            {calibration ? "Adjust" : "Undo tap"}
          </button>
        )}
        {calibration && (
          <button type="button" onClick={() => onDone(calibration)} className="h-14 flex-1 rounded-2xl bg-treble font-display text-xl font-bold text-ink">
            Looks right
          </button>
        )}
        {step === -1 && !calibration && (
          <button type="button" onClick={() => setPoints({})} className="h-14 flex-1 rounded-2xl bg-chalk font-display text-xl font-bold text-ink">
            Start again
          </button>
        )}
      </div>
    </div>
  );
}

/** The calibrated board's rings and wires, in video pixels. */
export function BoardLines({ calibration, faint = false }: { calibration: Calibration; faint?: boolean }) {
  const { rings, wires } = useMemo(() => overlayGeometry(calibration, 90), [calibration]);
  const d = (pts: Point[], close: boolean) => `M${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("L")}${close ? "Z" : ""}`;
  return (
    <g fill="none" stroke={faint ? "rgba(242,239,228,0.35)" : "var(--color-brass)"} strokeWidth={faint ? 1 : 2} vectorEffect="non-scaling-stroke">
      {rings.map((r, i) => (
        <path key={`r${i}`} d={d(r, true)} vectorEffect="non-scaling-stroke" />
      ))}
      {wires.map((w, i) => (
        <path key={`w${i}`} d={d(w, false)} vectorEffect="non-scaling-stroke" />
      ))}
    </g>
  );
}
