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
  ranked?: boolean;
  mode: ModeId;
  config: AnyConfig;
  players: GamePlayer[];
  darts: Dart[];
  startedAt: string;
  /** A session or match the players stopped before it was over. */
  ended?: boolean;
  /** Handed to the save queue. Undo is closed from then on, on every device showing this game. */
  saved?: boolean;
}

export interface PendingSave {
  id: string;
  kind: ActiveGame["kind"];
  ranked?: boolean;
  mode: ModeId;
  config: AnyConfig;
  playerIds: string[];
  darts: Dart[];
  startedAt: string;
}

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

export function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = () => listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const EMPTY: PendingSave[] = [];

/**
 * A game, its save queue and preferences under one key prefix. A pub table keeps its own, so closing it can wipe everything.
 * `onSet` hears every change the players make to the game, for sharing it with another device, and `queueSave`
 * can hold a finished game back until that device is known to agree with it.
 */
export function createGameStore(
  prefix: string,
  hooks: { onSet?: (g: ActiveGame | null) => void; queueSave?: (g: ActiveGame) => void } = {},
) {
  const ACTIVE = `${prefix}.active`;
  const PENDING = `${prefix}.pending`;
  const PREFS = `${prefix}.prefs`;
  const store = {
    active: () => read<ActiveGame | null>(ACTIVE, null),
    setActive(g: ActiveGame | null) {
      write(ACTIVE, g);
      hooks.onSet?.(g);
    },
    /** Takes a game from another device without echoing it back. */
    adoptActive: (g: ActiveGame | null) => write(ACTIVE, g),
    pending: () => read<PendingSave[]>(PENDING, EMPTY),
    addPending(save: PendingSave) {
      write(PENDING, [...store.pending().filter((p) => p.id !== save.id), save]);
    },
    /** Hands a finished game to the save queue. */
    queueSave(g: ActiveGame) {
      if (hooks.queueSave) hooks.queueSave(g);
      else store.addPending(toPendingSave(g));
    },
    removePending(id: string) {
      write(PENDING, store.pending().filter((p) => p.id !== id));
    },
    prefs: <T,>(key: string, fallback: T) => read<Record<string, unknown>>(PREFS, {})[key] as T ?? fallback,
    setPref(key: string, value: unknown) {
      write(PREFS, { ...read<Record<string, unknown>>(PREFS, {}), [key]: value });
    },
    start(game: Omit<ActiveGame, "id" | "darts" | "startedAt">) {
      store.setActive({ ...game, id: crypto.randomUUID(), darts: [], startedAt: new Date().toISOString() });
    },
    /** Removes every trace of this store from the device. */
    clear() {
      for (const key of [ACTIVE, PENDING, PREFS]) localStorage.removeItem(key);
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith(`${prefix}.live`)) localStorage.removeItem(key);
      }
      for (const l of listeners) l();
    },
  };
  return store;
}

export type GameStore = ReturnType<typeof createGameStore>;

export const gameStore = createGameStore("superdarts");
/** Games scored on a public device through a table code. Never mixed with the signed-in player's own. */
export const tableStore = createGameStore("superdarts.table");

export function useActiveGame(store: Pick<GameStore, "active"> = gameStore) {
  return useSyncExternalStore(subscribe, store.active, () => null);
}

export function usePendingSaves(store: Pick<GameStore, "pending"> = gameStore) {
  return useSyncExternalStore(subscribe, store.pending, () => EMPTY);
}

export function startGame(game: Omit<ActiveGame, "id" | "darts" | "startedAt">) {
  gameStore.start(game);
}

export function toPendingSave(g: ActiveGame): PendingSave {
  return {
    id: g.id,
    kind: g.kind,
    ranked: g.ranked,
    mode: g.mode,
    config: g.config,
    playerIds: g.players.map((p) => p.id),
    darts: g.darts,
    startedAt: g.startedAt,
  };
}
