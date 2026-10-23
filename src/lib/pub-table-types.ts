import type { GamePlayer } from "@/lib/game-store";

export type TableSession = { id: string; hostName: string; players: GamePlayer[]; expiresAt: string };
export type HostTable = { id: string; players: GamePlayer[]; createdAt: string; expiresAt: string | null; code: string | null; codeExpiresAt: string };
export type TableResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
export const TABLE_CODE_LENGTH = 6;

export function normalizeTableCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}
