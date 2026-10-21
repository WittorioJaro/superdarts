import "server-only";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { games, players, roomDarts, roomPlayers, rooms } from "@/db/schema";
import type { GameTransaction } from "./persist-game";
import type { RoomSettings, RoomSnapshot, RoomSummary } from "./rooms-types";

export function settingsOf(room: typeof rooms.$inferSelect): RoomSettings {
  return { mode: room.mode, config: room.config, ranked: room.ranked } as RoomSettings;
}

/** The room lock also makes the players, game id, saved flag and dart list one consistent snapshot. */
export async function getRoomSnapshot(roomId: string, transaction?: GameTransaction): Promise<RoomSnapshot | null> {
  if (!transaction) return db.transaction((tx) => getRoomSnapshot(roomId, tx));
  const [room] = await transaction.select().from(rooms).where(eq(rooms.id, roomId)).for("share");
  if (!room) return null;
  const members = await transaction.select({ id: players.id, name: players.name, color: players.color,
    avatarUrl: players.avatarUrl, position: roomPlayers.position }).from(roomPlayers)
    .innerJoin(players, eq(players.id, roomPlayers.playerId)).where(eq(roomPlayers.roomId, roomId)).orderBy(asc(roomPlayers.position));
  let game: RoomSnapshot["game"] = null;
  if (room.gameId && room.gameStartedAt) {
    const darts = await transaction.select({ dart: roomDarts.dart }).from(roomDarts)
      .where(and(eq(roomDarts.roomId, roomId), eq(roomDarts.gameId, room.gameId))).orderBy(asc(roomDarts.seq));
    const [saved] = await transaction.select({ id: games.id }).from(games).where(eq(games.id, room.gameId));
    game = { id: room.gameId, startedAt: room.gameStartedAt.toISOString(), darts: darts.map((d) => d.dart), saved: !!saved };
  }
  return { id: room.id, code: room.code, hostId: room.hostId, status: room.status, settings: settingsOf(room), players: members, game };
}

export async function getRoomByCode(code: string): Promise<{ snapshot: RoomSnapshot } | null> {
  const [room] = await db.select({ id: rooms.id }).from(rooms).where(sql`upper(${rooms.code}) = ${code.trim().toUpperCase()}`).limit(1);
  if (!room) return null;
  const snapshot = await getRoomSnapshot(room.id);
  return snapshot ? { snapshot } : null;
}

export async function myRooms(meId: string): Promise<RoomSummary[]> {
  const mine = await db.select({ room: rooms }).from(rooms).innerJoin(roomPlayers, eq(roomPlayers.roomId, rooms.id))
    .where(and(eq(roomPlayers.playerId, meId), ne(rooms.status, "closed"))).orderBy(desc(rooms.updatedAt)).limit(10);
  if (!mine.length) return [];
  const members = await db.select({ roomId: roomPlayers.roomId, id: players.id, name: players.name, color: players.color, avatarUrl: players.avatarUrl })
    .from(roomPlayers).innerJoin(players, eq(players.id, roomPlayers.playerId))
    .where(inArray(roomPlayers.roomId, mine.map(({ room }) => room.id))).orderBy(asc(roomPlayers.position));
  return mine.map(({ room }) => ({ code: room.code, status: room.status, settings: settingsOf(room), hostId: room.hostId,
    updatedAt: room.updatedAt.toISOString(), players: members.filter((p) => p.roomId === room.id)
      .map(({ id, name, color, avatarUrl }) => ({ id, name, color, avatarUrl })) }));
}
