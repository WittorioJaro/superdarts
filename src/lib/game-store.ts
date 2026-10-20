"use client";

import { useSyncExternalStore } from "react";
import type { Dart } from "./darts/board";
import type { AnyConfig, ModeId } from "./darts/modes";

/**
 * The game being played lives on the device, so a dropped connection or a
 * closed tab never loses darts. It's sent to the server once it ends.
 */
export interface GamePlayer {
  id: string;
  name: string;
  color: string;
  avatarUrl?: string | null;
}

export interface ActiveGame {
  id: string;
  kind: "practice" | "match";
  mode: ModeId;
  config: AnyConfig;
  players: GamePlayer[];
  darts: Dart[];
  startedAt: string;
  /** A practice session the player stopped before the drill was over. */
  ended?: boolean;
}

export interface PendingSave {
  id: string;
  kind: ActiveGame["kind"];
  mode: ModeId;
  config: AnyConfig;
  playerIds: string[];
  darts: Dart[];
  startedAt: string;
}

const ACTIVE = "superdarts.active";
const PENDING = "superdarts.pending";
const PREFS = "superdarts.prefs";

const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

function read<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value: T = fallback;
  try {
    value = raw ? (JSON.parse(raw) as T) : fallback;
  } catch {}
  cache.set(key, { raw, value });
  return value;
}

function write(key: string, value: unknown) {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(value));
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = () => listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const gameStore = {
  active: () => read<ActiveGame | null>(ACTIVE, null),
  setActive: (g: ActiveGame | null) => write(ACTIVE, g),
  pending: () => read<PendingSave[]>(PENDING, []),
  addPending(save: PendingSave) {
    write(PENDING, [...gameStore.pending().filter((p) => p.id !== save.id), save]);
  },
  removePending(id: string) {
    write(PENDING, gameStore.pending().filter((p) => p.id !== id));
  },
  prefs: <T,>(key: string, fallback: T) => read<Record<string, unknown>>(PREFS, {})[key] as T ?? fallback,
  setPref(key: string, value: unknown) {
    write(PREFS, { ...read<Record<string, unknown>>(PREFS, {}), [key]: value });
  },
};

const EMPTY: PendingSave[] = [];

export function useActiveGame() {
  return useSyncExternalStore(subscribe, gameStore.active, () => null);
}

export function usePendingSaves() {
  return useSyncExternalStore(subscribe, gameStore.pending, () => EMPTY);
}

export function startGame(game: Omit<ActiveGame, "id" | "darts" | "startedAt">) {
  gameStore.setActive({ ...game, id: crypto.randomUUID(), darts: [], startedAt: new Date().toISOString() });
}

export function toPendingSave(g: ActiveGame): PendingSave {
  return {
    id: g.id,
    kind: g.kind,
    mode: g.mode,
    config: g.config,
    playerIds: g.players.map((p) => p.id),
    darts: g.darts,
    startedAt: g.startedAt,
  };
}
