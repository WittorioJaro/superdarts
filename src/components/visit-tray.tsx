"use client";

import { type ReactNode, useCallback, useMemo, useState } from "react";
import { type Dart, dartLabel, dartScore, sameDart } from "@/lib/darts/board";
import type { ActiveGame } from "@/lib/game-store";
import { previewVisit } from "@/lib/visit-preview";

export interface Suggestion {
  dart: Dart;
  /** Model probability, 0–1. */
  p: number;
}

/** A dart waiting in the tray. Camera darts carry the model's ranked guesses; typed ones have none. */
export interface TrayDart {
  /** The camera's id for this dart, so a correction can be reported back to it. */
  id: string;
  dart: Dart;
  /** Ranked best first. `options[0]` is what the camera picked. */
  options: Suggestion[];
}

export interface Tray {
  darts: TrayDart[];
  /** Index of the dart the pad is fixing, or null when the pad adds darts. */
  fixing: number | null;
  /** The phone saw the darts come out of the board: the visit is surely over. */
  pulled: boolean;
  add(d: TrayDart): void;
  /** A pad tap: replaces the dart being fixed, otherwise adds a dart. */
  pad(d: Dart): void;
  choose(i: number, d: Dart): void;
  remove(i: number): void;
  fix(i: number | null): void;
  markPulled(): void;
  /** Drops the first n darts, after the game took them but not the rest. */
  drop(n: number): void;
  clear(): void;
}

let typed = 0;

export function useTray(): Tray {
  const [darts, setDarts] = useState<TrayDart[]>([]);
  const [fixing, setFixing] = useState<number | null>(null);
  const [pulled, setPulled] = useState(false);

  const add = useCallback((d: TrayDart) => {
    setDarts((ds) => (ds.some((x) => x.id === d.id) || ds.length >= 3 ? ds : [...ds, d]));
  }, []);
  const pad = useCallback(
    (d: Dart) => {
      if (fixing !== null) {
        setDarts((ds) => ds.map((x, i) => (i === fixing ? { ...x, dart: d } : x)));
        setFixing(null);
      } else {
        setDarts((ds) => (ds.length >= 3 ? ds : [...ds, { id: `typed-${++typed}`, dart: d, options: [] }]));
      }
    },
    [fixing],
  );
  const choose = useCallback((i: number, d: Dart) => {
    setDarts((ds) => ds.map((x, j) => (j === i ? { ...x, dart: d } : x)));
    setFixing(null);
  }, []);
  const remove = useCallback((i: number) => {
    setDarts((ds) => ds.filter((_, j) => j !== i));
    setFixing(null);
  }, []);
  const clear = useCallback(() => {
    setDarts([]);
    setFixing(null);
    setPulled(false);
  }, []);
  const markPulled = useCallback(() => setPulled(true), []);
  const drop = useCallback((n: number) => {
    setDarts((ds) => ds.slice(n));
    setFixing(null);
  }, []);

  return useMemo(
    () => ({ darts, fixing, pulled, add, pad, choose, remove, fix: setFixing, markPulled, drop, clear }),
    [darts, fixing, pulled, add, pad, choose, remove, markPulled, drop, clear],
  );
}

/**
 * The visit so far, dart by dart, before it counts. Each camera guess shows the next most likely
 * scores as one-tap swaps; tapping a dart lets the pad replace it. Nothing is scored until Confirm.
 */
export function VisitTray({
  tray,
  game,
  watching,
  onConfirm,
}: {
  tray: Tray;
  game: ActiveGame;
  /** The camera is live, so empty slots say it's looking. */
  watching: boolean;
  onConfirm: (darts: TrayDart[]) => void;
}) {
  const preview = useMemo(() => previewVisit(game, tray.darts.map((d) => d.dart)), [game, tray.darts]);
  const usable = tray.darts.slice(0, preview.applied);
  const extra = tray.darts.length - preview.applied;
  const total = usable.reduce((n, d) => n + dartScore(d.dart), 0);

  return (
    <section aria-label="This visit" className="flex shrink-0 flex-col gap-2">
      <ol className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => {
          const d = tray.darts[i];
          if (!d) return <EmptySlot key={i} n={i + 1} watching={watching && i === tray.darts.length} />;
          return (
            <Slot
              key={d.id}
              n={i + 1}
              d={d}
              fixing={tray.fixing === i}
              void={i >= preview.applied}
              onFix={() => tray.fix(tray.fixing === i ? null : i)}
              onChoose={(x) => tray.choose(i, x)}
              onRemove={() => tray.remove(i)}
            />
          );
        })}
      </ol>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate px-1 text-dim" aria-live="polite">
          {tray.fixing !== null ? (
            <span className="text-brass">Tap the right score for dart {tray.fixing + 1}</span>
          ) : tray.darts.length === 0 ? (
            watching ? "Throw. Darts show up here as they land." : "Tap the darts in, then confirm."
          ) : (
            <Outcome game={game} preview={preview} extra={extra} />
          )}
        </p>
        <button
          type="button"
          disabled={usable.length === 0}
          onClick={() => onConfirm(usable)}
          className={`flex h-14 shrink-0 items-center gap-3 rounded-2xl px-6 font-display text-2xl font-bold transition-[transform,background-color] duration-75 active:scale-[0.97] disabled:bg-cabinet disabled:text-dim ${
            tray.pulled || usable.length === 3 ? "animate-pulse bg-brass text-ink" : "bg-chalk text-ink"
          }`}
        >
          Confirm
          {usable.length > 0 && <span className="rounded-lg bg-ink/10 px-2 tabular-nums">{total}</span>}
        </button>
      </div>
    </section>
  );
}

function Outcome({ game, preview, extra }: { game: ActiveGame; preview: ReturnType<typeof previewVisit>; extra: number }) {
  const t = preview.turn;
  const spill = extra > 0 && (
    <span className="text-brass"> · {extra === 1 ? "The last dart is" : `The last ${extra} darts are`} past the end of the visit</span>
  );
  let main: ReactNode = "Check the darts, then confirm.";
  if (t && (game.mode === "x01" || game.mode === "checkout" || game.mode === "onetwentyone")) {
    if (t.bust) main = <span className="font-semibold text-double">Bust</span>;
    else if (t.checkout) main = <span className="font-semibold text-treble">Checkout</span>;
    else if (t.startScore !== null) main = <>Leaves <span className="font-semibold text-chalk">{t.startScore - t.points}</span></>;
  }
  return (
    <>
      {main}
      {spill}
    </>
  );
}

function EmptySlot({ n, watching }: { n: number; watching: boolean }) {
  return (
    <li className="flex h-28 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-wire text-dim">
      <span className="text-sm">Dart {n}</span>
      {watching && <span className="h-2 w-2 animate-pulse rounded-full bg-treble" aria-label="Camera watching" />}
    </li>
  );
}

function Slot({
  n,
  d,
  fixing,
  void: past,
  onFix,
  onChoose,
  onRemove,
}: {
  n: number;
  d: TrayDart;
  fixing: boolean;
  void: boolean;
  onFix: () => void;
  onChoose: (d: Dart) => void;
  onRemove: () => void;
}) {
  const picked = d.options.find((o) => sameDart(o.dart, d.dart));
  // Typed by hand, or swapped away from the camera's pick: the player has spoken.
  const confident = !d.options.length || !sameDart(d.options[0].dart, d.dart) || d.options[0].p >= 0.6;
  const alts = d.options.filter((o) => !sameDart(o.dart, d.dart)).slice(0, 3);
  return (
    <li
      className={`relative flex h-28 flex-col overflow-hidden rounded-2xl transition-colors ${
        fixing ? "bg-brass/15 ring-3 ring-brass" : confident ? "bg-felt" : "bg-felt ring-2 ring-brass/60"
      } ${past ? "opacity-40" : ""}`}
    >
      <button type="button" onClick={onFix} aria-label={`Dart ${n}: ${dartLabel(d.dart)}. Tap to change`} className="flex min-h-0 flex-1 items-center gap-2 pr-9 pl-3 text-left">
        <span className={`font-display text-5xl leading-none font-extrabold ${tone(d.dart)}`}>{dartLabel(d.dart)}</span>
        {picked && d.options.length > 1 && (
          <span className="ml-auto flex flex-col items-end text-xs text-dim">
            <span className="tabular-nums">{Math.round(picked.p * 100)}%</span>
            <span className="mt-0.5 h-1 w-10 overflow-hidden rounded-full bg-wire">
              <span className="block h-full rounded-full bg-chalk" style={{ width: `${Math.round(picked.p * 100)}%` }} />
            </span>
          </span>
        )}
      </button>
      {alts.length > 0 && (
        <div className="flex gap-1 px-1.5 pb-1.5">
          {alts.map((o) => (
            <button
              key={dartLabel(o.dart)}
              type="button"
              onClick={() => onChoose(o.dart)}
              aria-label={`Change to ${dartLabel(o.dart)}`}
              className={`h-9 min-w-0 flex-1 rounded-lg bg-ink/60 font-display text-lg font-bold transition-transform duration-75 active:scale-[0.94] ${tone(o.dart)}`}
            >
              {dartLabel(o.dart)}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove dart ${n}`}
        className="absolute top-1 right-1 flex h-8 w-8 items-center justify-center rounded-lg text-dim hover:text-chalk"
      >
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </li>
  );
}

function tone(d: Dart) {
  if (d.m === 0) return "text-dim";
  if (d.m === 3) return "text-treble";
  if (d.m === 2) return "text-double";
  return "text-chalk";
}
