"use client";

import { saveGame } from "@/app/actions";
import { type GameStore, type PendingSave, gameStore } from "./game-store";
import type { SaveResult } from "./persist-game";

export interface SyncResult {
  saved: number;
  errors: string[];
}

/** Sends every game waiting in a store through one save action. Safe to call repeatedly; saves are idempotent. */
export function createSync(store: GameStore, save: (game: PendingSave) => Promise<SaveResult>) {
  let running: Promise<SyncResult> | null = null;
  return (): Promise<SyncResult> => {
    running ??= (async () => {
      const result: SyncResult = { saved: 0, errors: [] };
      for (const pending of store.pending()) {
        try {
          const res = await save(pending);
          if (res.ok) result.saved++;
          else if (!res.retry) result.errors.push(res.error);
          if (res.ok || !res.retry) store.removePending(pending.id);
        } catch {
          // Offline or the server is unreachable. Keep it for next time.
          break;
        }
      }
      return result;
    })().finally(() => {
      running = null;
    });
    return running;
  };
}

export const syncPending = createSync(gameStore, saveGame);
