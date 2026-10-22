"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CamIcon, CameraPairing, useMyPhone } from "@/components/room-video";
import { Sheet } from "@/components/ui";
import { type Dart, sameDart } from "@/lib/darts/board";
import { type PhoneStatus, useVision } from "@/lib/use-vision";
import { type TrayDart, useTray } from "./visit-tray";

/**
 * Camera darts go into the tray, never straight into the game. While the tray is in use the pad
 * adds to it or fixes a dart in it, and Undo takes the newest tray dart first.
 */
export function useCameraScoring(
  meId: string,
  /** Returns how many darts the game took, which is fewer than given when an undo or a turn change got in first. */
  commit: (darts: Dart[]) => number,
  /** False while someone else (or a bot) throws: whatever the camera sees then isn't this visit. */
  accepting: boolean,
) {
  const tray = useTray();
  const open = useRef(accepting);
  useEffect(() => {
    open.current = accepting;
  }, [accepting]);
  const vision = useVision(meId, {
    onDart: (m) => open.current && tray.add({ id: m.id, dart: m.candidates[0].dart, options: m.candidates }),
    onTakeout: () => open.current && tray.markPulled(),
  });
  const { send } = vision;
  // Shown while the camera can score, and kept while it holds darts even if the phone drops out.
  const active = vision.scoring || tray.darts.length > 0;

  const confirm = useCallback(
    (darts: TrayDart[]) => {
      const taken = commit(darts.map((d) => d.dart));
      // Only changed guesses teach the phone; a confirmed top guess carries no new information.
      for (const d of darts.slice(0, taken)) if (d.options.length && !sameDart(d.options[0].dart, d.dart)) send({ v: 1, kind: "correction", id: d.id, dart: d.dart });
      // Anything the game refused stays in the tray to confirm again, rather than vanishing.
      if (taken < darts.length) return tray.drop(taken);
      send({ v: 1, kind: "visit" });
      tray.clear();
    },
    [commit, send, tray],
  );

  const undo = useCallback(
    (fallback: () => void) => {
      if (tray.darts.length) tray.remove(tray.darts.length - 1);
      else fallback();
    },
    [tray],
  );

  return { tray, status: vision.status, send, active, confirm, undo };
}

export function scoringLabel(status: PhoneStatus | null, phone: boolean) {
  if (!phone) return "Pair your phone";
  if (!status) return "Open the camera page on the phone";
  if (!status.calibrated) return "Set up the board on the phone";
  if (status.state === "waiting") return "Clear the board so the camera can see it empty";
  return "Scoring with the camera";
}

/**
 * Header button for camera scoring in a local game. Off by default, so a game without a phone
 * never opens a LiveKit connection. Must be rendered inside SoloVideo.
 */
export function CameraButton({
  enabled,
  onEnabled,
  status,
  onReset,
}: {
  enabled: boolean;
  onEnabled: (on: boolean) => void;
  status: PhoneStatus | null;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const phone = useMyPhone();
  const scoring = enabled && !!status?.calibrated && status.state !== "waiting";
  const label = enabled ? scoringLabel(status, phone) : "Camera scoring";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition ${
          scoring ? "bg-treble/20 text-treble" : enabled ? "bg-brass/20 text-brass" : "text-dim hover:bg-cabinet hover:text-chalk"
        }`}
      >
        <CamIcon off={!enabled} />
        {scoring && <span className="absolute top-2 right-2 h-2 w-2 animate-pulse rounded-full bg-treble" />}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} label="Camera scoring">
        {!enabled ? (
          <div className="flex flex-col gap-4">
            <h2 className="font-display text-3xl font-bold">Score with your phone</h2>
            <p className="text-dim">
              Stand your phone where it sees the whole board. It spots each dart as it lands and suggests the score. You check the
              visit, fix any dart with one tap, and confirm. Nothing counts until you do.
            </p>
            <button type="button" onClick={() => onEnabled(true)} className="h-14 rounded-2xl bg-chalk font-display text-xl font-bold text-ink">
              Turn on camera scoring
            </button>
          </div>
        ) : !phone ? (
          <div className="flex flex-col gap-4">
            <CameraPairing phone={false} picture={false} onDone={() => setOpen(false)} />
            <button type="button" onClick={() => onEnabled(false)} className="h-12 rounded-2xl font-semibold text-dim hover:text-chalk">
              Turn off camera scoring
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <h2 className="font-display text-3xl font-bold">Camera scoring</h2>
            <p className="flex items-center gap-2 text-lg">
              <span className={`h-2.5 w-2.5 rounded-full ${scoring ? "bg-treble" : "bg-brass"}`} />
              {scoringLabel(status, phone)}
            </p>
            <p className="text-dim">
              {!status
                ? "The phone is connected but its camera hasn't started. It may be asking for camera permission."
                : !status?.calibrated
                  ? "On the phone, tap Set up scoring and follow the four taps around the board."
                  : "If the camera keeps seeing darts that aren't there, pull every dart out and retake the empty board."}
            </p>
            {status?.calibrated && (
              <button
                type="button"
                onClick={() => {
                  onReset();
                  setOpen(false);
                }}
                className="h-14 rounded-2xl bg-felt font-display text-xl font-bold hover:bg-wire"
              >
                Board is empty, retake it
              </button>
            )}
            <button type="button" onClick={() => onEnabled(false)} className="h-12 rounded-2xl font-semibold text-dim hover:text-chalk">
              Turn off camera scoring
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}
