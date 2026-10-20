"use client";

import { useSyncExternalStore } from "react";
import type { AnyConfig, ModeId } from "./darts/modes";
import { type GamePlayer, gameStore, startGame } from "./game-store";

/** A training plan being worked through, one drill after another. Lives on the device like the active game. */
export interface PlanStep {
  mode: ModeId;
  config: AnyConfig;
  title: string;
  reason: string;
  minutes: number;
}

export interface ActivePlan {
  steps: PlanStep[];
  index: number;
  /** The game started for the current step, so the counter knows it belongs to the plan. */
  gameId: string;
  player: GamePlayer;
}

const KEY = "superdarts.plan";
const listeners = new Set<() => void>();
let cached: { raw: string | null; value: ActivePlan | null } = { raw: null, value: null };

function read(): ActivePlan | null {
  const raw = localStorage.getItem(KEY);
  if (raw === cached.raw) return cached.value;
  let value: ActivePlan | null = null;
  try {
    value = raw ? (JSON.parse(raw) as ActivePlan) : null;
  } catch {}
  cached = { raw, value };
  return value;
}

function write(plan: ActivePlan | null) {
  if (plan) localStorage.setItem(KEY, JSON.stringify(plan));
  else localStorage.removeItem(KEY);
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function usePlan() {
  return useSyncExternalStore(subscribe, read, () => null);
}

export const planStore = { get: read, clear: () => write(null) };

/** Start step `index` of a plan as a practice game. */
export function startPlanStep(steps: PlanStep[], index: number, player: GamePlayer) {
  const step = steps[index];
  startGame({ kind: "practice", mode: step.mode, config: step.config, players: [player] });
  write({ steps, index, gameId: gameStore.active()!.id, player });
}
