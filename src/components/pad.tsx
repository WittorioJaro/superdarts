"use client";

import { useEffect, useState } from "react";
import { BULLSEYE, type Dart, MISS, OUTER_BULL, dartLabel, isPossibleVisitTotal } from "@/lib/darts/board";

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

type TotalOpts = { darts?: 1 | 2 | 3; atDouble?: number };

/**
 * Type the visit's total instead of each dart. When the total finishes the leg, it asks
 * the one or two questions the stats need.
 */
export function TotalPad({
  onTotal,
  needs,
  canFinish,
  onUndo,
  canUndo,
}: {
  onTotal: (total: number, opts: TotalOpts) => void;
  needs: (total: number) => { darts: boolean; atDouble: boolean };
  /** Whether `total` can be checked out with `darts` darts under the game's finishing rule. */
  canFinish: (total: number, darts: 1 | 2 | 3) => boolean;
  onUndo: () => void;
  canUndo: boolean;
}) {
  const [typed, setTyped] = useState("");
  const [ask, setAsk] = useState<{ total: number; darts: boolean; atDouble: boolean; picked: TotalOpts } | null>(null);
  const value = typed === "" ? null : Number(typed);
  const valid = value !== null && isPossibleVisitTotal(value);

  function press(d: string) {
    setTyped((t) => (t === "0" ? d : `${t}${d}`).slice(0, 3));
  }

  function submit(total = value) {
    if (total === null || !isPossibleVisitTotal(total)) return;
    const n = needs(total);
    if (n.darts || n.atDouble) setAsk({ total, ...n, picked: {} });
    else finish(total, {});
  }

  function finish(total: number, opts: TotalOpts) {
    onTotal(total, opts);
    setTyped("");
    setAsk(null);
  }

  function pick(next: TotalOpts) {
    if (!ask) return;
    const picked = { ...ask.picked, ...next };
    if ((!ask.darts || picked.darts) && (!ask.atDouble || picked.atDouble !== undefined)) finish(ask.total, picked);
    else setAsk({ ...ask, picked });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (ask || e.target instanceof HTMLInputElement) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === "Enter") submit();
      else if (e.key === "Backspace") {
        if (typed) setTyped((t) => t.slice(0, -1));
        else onUndo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const key =
    "flex items-center justify-center rounded-2xl font-display font-bold transition-[transform,background-color] duration-75 active:scale-[0.94] select-none disabled:opacity-30";

  if (ask) {
    const dartsLeft = ask.picked.darts ?? 3;
    return (
      <div className="flex h-full flex-col justify-center gap-6 rounded-3xl bg-cabinet p-6">
        <p className="font-display text-5xl font-extrabold">{ask.total}</p>
        {ask.darts && !ask.picked.darts && (
          <Question label="Darts used to finish">
            {([1, 2, 3] as const).map((n) => (
              <button
                key={n}
                type="button"
                disabled={!canFinish(ask.total, n)}
                onClick={() => pick({ darts: n })}
                className={`${key} h-20 flex-1 bg-felt text-4xl`}
              >
                {n}
              </button>
            ))}
          </Question>
        )}
        {ask.atDouble && (!ask.darts || ask.picked.darts) && (
          <Question label="Darts at a double">
            {Array.from({ length: dartsLeft + 1 }, (_, n) => n)
              .filter((n) => !ask.darts || n >= 1)
              .map((n) => (
                <button key={n} type="button" onClick={() => pick({ atDouble: n })} className={`${key} h-20 flex-1 bg-felt text-4xl`}>
                  {n}
                </button>
              ))}
          </Question>
        )}
        <button type="button" onClick={() => setAsk(null)} className="h-12 text-dim hover:text-chalk">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-3 grid-rows-[1.2fr_repeat(4,1fr)_1fr] gap-2" aria-label="Visit total pad">
      <div className="col-span-3 flex items-center justify-between rounded-2xl bg-ink/60 px-5">
        <span className={`font-display text-6xl font-extrabold ${value !== null && !valid ? "text-double" : ""}`}>{typed || <span className="text-dim">0</span>}</span>
        <span className="text-dim">{value !== null && !valid ? "Not possible with three darts" : "Visit total"}</span>
      </div>
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <button key={d} type="button" onClick={() => press(d)} className={`${key} bg-felt text-4xl hover:brightness-125`}>
          {d}
        </button>
      ))}
      <button
        type="button"
        onClick={() => (typed ? setTyped((t) => t.slice(0, -1)) : onUndo())}
        disabled={!typed && !canUndo}
        aria-label={typed ? "Delete digit" : "Undo last visit"}
        className={`${key} bg-cabinet text-2xl text-dim`}
      >
        {typed ? "⌫" : "Undo"}
      </button>
      <button type="button" onClick={() => press("0")} className={`${key} bg-felt text-4xl hover:brightness-125`}>
        0
      </button>
      <button type="button" onClick={() => submit()} disabled={!valid} className={`${key} bg-chalk text-3xl text-ink`}>
        Enter
      </button>
      <div className="col-span-3 grid grid-cols-5 gap-2">
        {[0, 26, 45, 60, 100].map((n) => (
          <button key={n} type="button" onClick={() => submit(n)} className={`${key} bg-cabinet text-2xl text-dim hover:text-chalk`}>
            {n === 0 ? "No score" : n}
          </button>
        ))}
      </div>
    </div>
  );
}

function Question({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-lg text-dim">{label}</span>
      <div className="flex gap-3">{children}</div>
    </div>
  );
}
