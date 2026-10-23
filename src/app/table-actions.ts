"use server";

import { randomBytes } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { players, pubTables } from "@/db/schema";
import { getCurrentPlayer } from "@/lib/auth";
import { saveGameSchema } from "@/lib/darts/schemas";
import type { GamePlayer } from "@/lib/game-store";
import { persistGame, type SaveResult } from "@/lib/persist-game";
import { TABLE_CODE_ALPHABET } from "@/lib/pub-table-token";
import { normalizeTableCode, TABLE_CODE_LENGTH, type HostTable, type TableResult } from "@/lib/pub-table-types";
import { CODE_TTL, generateCode, getTableSession, hashToken, TABLE_COOKIE, TABLE_TTL } from "@/lib/pub-tables";
import { revalidateGameData } from "@/lib/revalidate-data";

const playerIdsSchema = z.array(z.uuid()).min(1).max(8).refine((ids) => new Set(ids).size === ids.length);
const codeSchema = z.string().regex(new RegExp(`^[${TABLE_CODE_ALPHABET}]{${TABLE_CODE_LENGTH}}$`));
const playerFields = { id: players.id, name: players.name, color: players.color, avatarUrl: players.avatarUrl };

function hostTable(table: typeof pubTables.$inferSelect, members: GamePlayer[]): HostTable {
  const byId = new Map(members.map((p) => [p.id, p]));
  return { id: table.id, players: table.playerIds.flatMap((id) => byId.get(id) ?? []), createdAt: table.createdAt.toISOString(),
    expiresAt: table.expiresAt?.toISOString() ?? null, code: table.code, codeExpiresAt: table.codeExpiresAt.toISOString() };
}

export async function createTableCode(playerIds: string[]): Promise<TableResult<{ table: HostTable }>> {
  const me = await getCurrentPlayer();
  const parsed = playerIdsSchema.safeParse(playerIds);
  if (!parsed.success) return { ok: false, error: "Choose between one and eight different players." };
  const members = await db.select(playerFields).from(players).where(and(inArray(players.id, parsed.data), isNull(players.bot)));
  if (members.length !== parsed.data.length) return { ok: false, error: "Choose existing players who aren't bots." };
  await db.delete(pubTables).where(and(eq(pubTables.hostId, me.id), isNull(pubTables.tokenHash)));
  for (let attempt = 0; attempt < 5; attempt++) {
    const [table] = await db.insert(pubTables).values({ hostId: me.id, playerIds: parsed.data, code: generateCode(),
      codeExpiresAt: new Date(Date.now() + CODE_TTL * 1000) }).onConflictDoNothing({ target: pubTables.code }).returning();
    if (table) return { ok: true, table: hostTable(table, members) };
  }
  return { ok: false, error: "Couldn't create a table code. Please try again." };
}

export async function redeemTableCode(code: string): Promise<TableResult> {
  const parsed = codeSchema.safeParse(typeof code === "string" ? normalizeTableCode(code) : code);
  if (!parsed.success) return { ok: false, error: "That code doesn't look right." };
  const token = randomBytes(32).toString("base64url");
  const [table] = await db.update(pubTables).set({ code: null, tokenHash: hashToken(token), redeemedAt: sql`now()`,
    expiresAt: sql`now() + ${TABLE_TTL} * interval '1 second'` }).where(and(eq(pubTables.code, parsed.data),
    gt(pubTables.codeExpiresAt, sql`now()`), isNull(pubTables.tokenHash), isNull(pubTables.closedAt))).returning({ id: pubTables.id });
  if (!table) {
    await setTimeout(500);
    return { ok: false, error: "That code isn't valid or has expired. Make a new one on your phone." };
  }
  (await cookies()).set(TABLE_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "strict", path: "/", maxAge: TABLE_TTL });
  return { ok: true };
}

export async function saveTableGame(input: unknown): Promise<SaveResult> {
  const session = await getTableSession();
  if (!session) return { ok: false, retry: false, error: "This table has been closed." };
  const parsed = saveGameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, retry: false, error: "The game data was malformed." };
  const game = parsed.data;
  if (game.kind !== "match" || !["x01", "cricket"].includes(game.mode)) {
    return { ok: false, retry: false, error: "This table only saves X01 and cricket matches." };
  }
  if (game.playerIds.some((id) => !session.playerIds.includes(id))) {
    return { ok: false, retry: false, error: "Only the players chosen for this table can play." };
  }
  const result = await persistGame(game, session.hostId);
  if (!result.ok) return result;
  revalidateGameData();
  return { ok: true };
}

export async function closeTable(): Promise<TableResult> {
  const store = await cookies();
  const token = store.get(TABLE_COOKIE)?.value;
  if (token) await db.update(pubTables).set({ closedAt: sql`now()` })
    .where(and(eq(pubTables.tokenHash, hashToken(token)), isNull(pubTables.closedAt)));
  store.delete(TABLE_COOKIE);
  return { ok: true };
}

export async function listHostTables(): Promise<HostTable[]> {
  const me = await getCurrentPlayer();
  const tables = await db.select().from(pubTables).where(and(eq(pubTables.hostId, me.id), isNull(pubTables.closedAt),
    or(and(isNull(pubTables.tokenHash), gt(pubTables.codeExpiresAt, sql`now()`)), gt(pubTables.expiresAt, sql`now()`))))
    .orderBy(desc(pubTables.createdAt));
  if (!tables.length) return [];
  const ids = [...new Set(tables.flatMap((t) => t.playerIds))];
  const members = ids.length ? await db.select(playerFields).from(players).where(inArray(players.id, ids)) : [];
  return tables.map((t) => hostTable(t, members));
}

export async function closeHostTable(id: string): Promise<TableResult> {
  const me = await getCurrentPlayer();
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Invalid table." };
  await db.update(pubTables).set({ closedAt: sql`now()`, code: null })
    .where(and(eq(pubTables.id, id), eq(pubTables.hostId, me.id), isNull(pubTables.closedAt)));
  return { ok: true };
}
