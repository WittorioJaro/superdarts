"use client";

import { saveGame } from "@/app/actions";
import { gameStore } from "./game-store";

let running: Promise<SyncResult> | null = null;

export interface SyncResult {
  saved: number;
  errors: string[];
}

/** Sends every game waiting on this device. Safe to call repeatedly; saves are idempotent. */
export function syncPending(): Promise<SyncResult> {
  running ??= (async () => {
    const result: SyncResult = { saved: 0, errors: [] };
    for (const save of gameStore.pending()) {
      try {
        const res = await saveGame(save);
        if (res.ok) result.saved++;
        else if (!res.retry) result.errors.push(res.error);
        if (res.ok || !res.retry) gameStore.removePending(save.id);
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
}
