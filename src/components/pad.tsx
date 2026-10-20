"use client";

import { useEffect, useState } from "react";
import { BULLSEYE, type Dart, MISS, OUTER_BULL, dartLabel } from "@/lib/darts/board";

const NUMBERS = Array.from({ length: 20 }, (_, i) => i + 1);

/**
 * One tap per dart. Double and Treble arm the next number, then drop back to single.
 * The bulls have their own keys so they never need a modifier.
 */
export function Pad({
  onDart,
  onUndo,
  canUndo,
  targets = [],
  quick,
  disabled,
}: {
  onDart: (d: Dart) => void;
  onUndo: () => void;
  canUndo: boolean;
  /** Numbers worth aiming at right now, outlined on the pad. */
  targets?: number[];
  /** A one-tap key for the dart the drill asks for. */
  quick?: Dart | null;
  disabled?: boolean;
}) {
  const [mult, setMult] = useState<1 | 2 | 3>(1);

  function hit(d: Dart) {
    if (disabled) return;
    onDart(d);
    setMult(1);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "Backspace" || ((e.metaKey || e.ctrlKey) && e.key === "z")) onUndo();
      else if (e.key === "d") setMult((m) => (m === 2 ? 1 : 2));
      else if (e.key === "t") setMult((m) => (m === 3 ? 1 : 3));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onUndo]);

  const key =
    "relative flex items-center justify-center rounded-2xl font-display font-bold transition-[transform,background-color] duration-75 active:scale-[0.94] select-none disabled:opacity-30";

  return (
    <div className="grid h-full grid-cols-5 grid-rows-[1fr_1fr_1fr_1fr_1fr_1fr] gap-2" aria-label="Score pad">
      <div className={`col-span-5 grid gap-2 ${quick ? "grid-cols-3" : "grid-cols-2"}`}>
        <button
          type="button"
          aria-pressed={mult === 2}
          onClick={() => setMult((m) => (m === 2 ? 1 : 2))}
          className={`${key} text-3xl ${mult === 2 ? "bg-double text-chalk" : "border-2 border-double/70 text-double"}`}
        >
          Double
        </button>
        <button
          type="button"
          aria-pressed={mult === 3}
          onClick={() => setMult((m) => (m === 3 ? 1 : 3))}
          className={`${key} text-3xl ${mult === 3 ? "bg-treble text-ink" : "border-2 border-treble/70 text-treble"}`}
        >
          Treble
        </button>
        {quick && (
          <button type="button" onClick={() => hit(quick)} className={`${key} bg-brass text-3xl text-ink`}>
            Hit {dartLabel(quick)}
          </button>
        )}
      </div>

      {NUMBERS.map((n) => {
        const label = mult === 3 ? `T${n}` : mult === 2 ? `D${n}` : String(n);
        const tone = mult === 3 ? "bg-treble/20 text-chalk" : mult === 2 ? "bg-double/20 text-chalk" : "bg-felt text-chalk";
        const target = targets.includes(n);
        return (
          <button
            key={n}
            type="button"
            onClick={() => hit({ s: n, m: mult })}
            aria-label={label}
            className={`${key} ${tone} text-4xl hover:brightness-125 ${target ? "ring-3 ring-brass ring-inset" : ""}`}
          >
            {mult > 1 && <span className="mr-0.5 text-[0.6em] opacity-70">{mult === 3 ? "T" : "D"}</span>}
            {n}
          </button>
        );
      })}

      <button type="button" onClick={() => hit(MISS)} className={`${key} bg-cabinet text-2xl text-dim`}>
        Miss
      </button>
      <button
        type="button"
        onClick={() => hit(OUTER_BULL)}
        className={`${key} bg-treble/20 text-3xl text-treble ${targets.includes(25) ? "ring-3 ring-brass ring-inset" : ""}`}
      >
        25
      </button>
      <button
        type="button"
        onClick={() => hit(BULLSEYE)}
        className={`${key} col-span-2 bg-double/20 text-3xl text-double ${targets.includes(25) ? "ring-3 ring-brass ring-inset" : ""}`}
      >
        Bull 50
      </button>
      <button
        type="button"
        onClick={() => {
          onUndo();
          setMult(1);
        }}
        disabled={!canUndo}
        aria-label="Undo last dart"
        className={`${key} bg-cabinet text-dim`}
      >
        <svg aria-hidden width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
        </svg>
      </button>
    </div>
  );
}
