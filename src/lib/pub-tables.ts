import "server-only";
import { and, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/db";
import { players, pubTables } from "@/db/schema";
import { hashToken } from "./pub-table-token";
import type { TableSession } from "./pub-table-types";

export { generateCode, hashToken } from "./pub-table-token";

export const TABLE_COOKIE = "sd_table";
export const CODE_TTL = 10 * 60;
export const TABLE_TTL = 12 * 60 * 60;

export const getTableSession = cache(async (): Promise<(TableSession & { hostId: string; playerIds: string[] }) | null> => {
  const token = (await cookies()).get(TABLE_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [table] = await db.select().from(pubTables).where(and(eq(pubTables.tokenHash, hashToken(token)),
    isNull(pubTables.closedAt), gt(pubTables.expiresAt, sql`now()`))).limit(1);
  if (!table?.expiresAt || !table.playerIds.length) return null;
  const members = await db.select({ id: players.id, name: players.name, color: players.color, avatarUrl: players.avatarUrl })
    .from(players).where(inArray(players.id, [...table.playerIds, table.hostId]));
  const byId = new Map(members.map((p) => [p.id, p]));
  const host = byId.get(table.hostId);
  if (!host || table.playerIds.some((id) => !byId.has(id))) return null;
  return { id: table.id, hostId: table.hostId, hostName: host.name, playerIds: table.playerIds,
    players: table.playerIds.map((id) => byId.get(id)!), expiresAt: table.expiresAt.toISOString() };
});
