import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { pubTableLive } from "@/db/schema";
import { getCurrentPlayer } from "./auth";
import { configSchemas, dartSchema } from "./darts/schemas";
import type { ActiveGame } from "./game-store";
import { getHostTableSession, getTableSession } from "./pub-tables";
import type { LiveState, PushResult } from "./pub-table-types";

/** Who may read and score a table's game: the computer holding its cookie, or the host's phone by table id. */
export type LiveAccess = { tableId: string; hostId: string; playerIds: string[] };

export async function liveAccess(tableId?: string): Promise<LiveAccess | null> {
  const session = tableId === undefined ? await getTableSession() : await getHostTableSession(tableId, (await getCurrentPlayer()).id);
  return session && { tableId: session.id, hostId: session.hostId, playerIds: session.playerIds };
}

const playerSchema = z.object({ id: z.uuid(), name: z.string().max(80), color: z.string().max(32),
  avatarUrl: z.string().max(2048).nullish() });

const liveGameSchema = z.object({
  id: z.uuid(),
  kind: z.literal("match"),
  mode: z.enum(["x01", "cricket"]),
  config: z.unknown(),
  ranked: z.boolean().optional(),
  players: z.array(playerSchema).min(1).max(8),
  darts: z.array(dartSchema).max(5000),
  startedAt: z.iso.datetime(),
  ended: z.boolean().optional(),
  saved: z.boolean().optional(),
}).refine((g) => configSchemas[g.mode].safeParse(g.config).success, "The game settings were malformed.")
  .refine((g) => g.mode === "x01" || !g.darts.some((d) => d.v), "Visit totals are only accepted in X01")
  .refine((g) => new Set(g.players.map((p) => p.id)).size === g.players.length, "A player was listed twice.");

export function parseLiveGame(input: unknown, access: LiveAccess): ActiveGame | null | undefined {
  if (input === null) return null;
  const parsed = liveGameSchema.safeParse(input);
  if (!parsed.success || parsed.data.players.some((p) => !access.playerIds.includes(p.id))) return undefined;
  return parsed.data as ActiveGame;
}

export async function readLive(tableId: string): Promise<LiveState> {
  const [row] = await db.select({ rev: pubTableLive.rev, game: pubTableLive.game }).from(pubTableLive)
    .where(eq(pubTableLive.tableId, tableId)).limit(1);
  return row ? { rev: row.rev, game: row.game ?? null } : { rev: 0, game: null };
}

export async function readLiveRev(tableId: string): Promise<number> {
  const [row] = await db.select({ rev: pubTableLive.rev }).from(pubTableLive).where(eq(pubTableLive.tableId, tableId)).limit(1);
  return row?.rev ?? 0;
}

/** Replaces the game only if nobody else wrote since `base`. Otherwise hands back what's there now. */
export async function writeLive(tableId: string, base: number, game: ActiveGame | null): Promise<PushResult> {
  const [row] = base === 0
    ? await db.insert(pubTableLive).values({ tableId, rev: 1, game }).onConflictDoNothing().returning({ rev: pubTableLive.rev })
    : await db.update(pubTableLive).set({ rev: sql`${pubTableLive.rev} + 1`, game, updatedAt: new Date() })
      .where(and(eq(pubTableLive.tableId, tableId), eq(pubTableLive.rev, base))).returning({ rev: pubTableLive.rev });
  if (row) return { ok: true, rev: row.rev };
  return { ok: false, conflict: true, ...(await readLive(tableId)) };
}
