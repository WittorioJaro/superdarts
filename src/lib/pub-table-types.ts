import type { ActiveGame, GamePlayer } from "@/lib/game-store";

export type TableSession = { id: string; hostName: string; players: GamePlayer[]; expiresAt: string };
export type HostTable = { id: string; players: GamePlayer[]; createdAt: string; expiresAt: string | null; code: string | null; codeExpiresAt: string };
export type TableResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
export const TABLE_CODE_LENGTH = 6;
/** A table save the server turned down, kept in the table store for the next screen to show. */
export const SAVE_ERROR = "save-error";

export function normalizeTableCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

/** The game a pub table is playing, as the server last saw it. `rev` counts every accepted write. */
export type LiveState = { rev: number; game: ActiveGame | null };
export type PushResult = { ok: true; rev: number } | ({ ok: false; conflict: true } & LiveState) | { ok: false; conflict: false; closed: boolean; error: string };
