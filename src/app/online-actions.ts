"use server";

import { randomInt, randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { games, players, roomDarts, roomPlayers, rooms } from "@/db/schema";
import { getCurrentPlayer } from "@/lib/auth";
import { signCameraToken, verifyCameraToken } from "@/lib/camera-token";
import type { Dart } from "@/lib/darts/board";
import { gameDetail, gameTitle } from "@/lib/darts/labels";
import { replay } from "@/lib/darts/modes";
import { isGameFinished, rotate, turnOf } from "@/lib/darts/rooms";
import { configSchemas, dartSchema } from "@/lib/darts/schemas";
import { cameraIdentity, type CameraLink, type CameraSession, type RoomInvite } from "@/lib/friends-types";
import { persistGame, type GameTransaction } from "@/lib/persist-game";
import { getRoomSnapshot } from "@/lib/rooms";
import type { RoomActionResult, RoomSettings, RoomSnapshot } from "@/lib/rooms-types";

const idSchema = z.uuid();
const codeSchema = z.string().trim().toUpperCase().regex(/^[A-HJKMNP-Z2-9]{4}$/);
const settingsSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("x01"), config: configSchemas.x01, ranked: z.boolean() }),
  z.object({ mode: z.literal("cricket"), config: configSchemas.cricket, ranked: z.boolean() }),
]);
const dartRequestSchema = z.object({ roomId: idSchema, gameId: idSchema, seq: z.number().int().min(0).max(5000), dart: dartSchema });
const undoRequestSchema = dartRequestSchema.omit({ dart: true });
const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

type Room = typeof rooms.$inferSelect;
type Member = typeof roomPlayers.$inferSelect;
class RoomError extends Error {}
function requireRoom(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RoomError(message);
}

/** Every mutation holds the same row lock until all its writes (including stats) commit. */
async function withRoom<T extends object = object>(roomId: string, meId: string,
  action: (tx: GameTransaction, room: Room, members: Member[]) => Promise<RoomActionResult<T>>): Promise<RoomActionResult<T>> {
  if (!idSchema.safeParse(roomId).success) return { ok: false, error: "Invalid room." };
  try {
    return await db.transaction(async (tx) => {
      const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).for("update");
      requireRoom(room, "The room no longer exists.");
      const members = await tx.select().from(roomPlayers).where(eq(roomPlayers.roomId, roomId)).orderBy(asc(roomPlayers.position));
      requireRoom(members.some((p) => p.playerId === meId), "You're not a member of this room.");
      return action(tx, room, members);
    });
  } catch (error) {
    if (error instanceof RoomError) return { ok: false, error: error.message };
    throw error;
  }
}

async function currentGame(tx: GameTransaction, room: Room) {
  requireRoom(room.gameId && room.gameStartedAt, "The game hasn't started yet.");
  const rows = await tx.select().from(roomDarts).where(and(eq(roomDarts.roomId, room.id), eq(roomDarts.gameId, room.gameId)))
    .orderBy(asc(roomDarts.seq));
  const [saved] = await tx.select({ id: games.id }).from(games).where(eq(games.id, room.gameId));
  return { rows, darts: rows.map((d) => d.dart), saved: !!saved, id: room.gameId, startedAt: room.gameStartedAt };
}

async function saveFinished(tx: GameTransaction, room: Room, members: Member[], game: Awaited<ReturnType<typeof currentGame>>) {
  if (game.saved) return;
  const result = await persistGame({ id: game.id, kind: "match", mode: room.mode, config: room.config, ranked: room.ranked,
    playerIds: members.map((p) => p.playerId), darts: game.darts, startedAt: game.startedAt.toISOString() }, room.hostId, tx);
  requireRoom(result.ok, result.ok ? "" : result.error);
}

async function touch(tx: GameTransaction, roomId: string) {
  await tx.update(rooms).set({ updatedAt: new Date() }).where(eq(rooms.id, roomId));
}

export async function createRoom(settings: RoomSettings): Promise<RoomActionResult<{ code: string }>> {
  const me = await getCurrentPlayer();
  const parsed = settingsSchema.safeParse(settings);
  if (!parsed.success) return { ok: false, error: "The room settings were malformed." };
  const input = parsed.data;
  const ranked = input.mode === "x01" && input.config.startScore === 501 && input.ranked;
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
    const created = await db.transaction(async (tx) => {
      const [room] = await tx.insert(rooms).values({ code, hostId: me.id, mode: input.mode, config: input.config, ranked })
        .onConflictDoNothing({ target: rooms.code }).returning({ id: rooms.id });
      if (!room) return false;
      await tx.insert(roomPlayers).values({ roomId: room.id, playerId: me.id, position: 0 });
      return true;
    });
    if (created) return { ok: true, code };
  }
  return { ok: false, error: "Couldn't create a room. Please try again." };
}

export async function joinRoom(code: string): Promise<RoomActionResult<{ roomId: string }>> {
  const me = await getCurrentPlayer();
  const parsed = codeSchema.safeParse(code);
  if (!parsed.success) return { ok: false, error: "Enter a four-character room code." };
  try {
    return await db.transaction(async (tx) => {
      const [room] = await tx.select().from(rooms).where(eq(rooms.code, parsed.data)).for("update");
      requireRoom(room, "The room doesn't exist.");
      const members = await tx.select().from(roomPlayers).where(eq(roomPlayers.roomId, room.id));
      if (members.some((p) => p.playerId === me.id)) return { ok: true, roomId: room.id };
      requireRoom(room.status !== "closed", "The room is closed.");
      requireRoom(room.status === "lobby", "The game has already started.");
      requireRoom(members.length < 4, "The room is full.");
      await tx.insert(roomPlayers).values({ roomId: room.id, playerId: me.id, position: members.length });
      await touch(tx, room.id);
      return { ok: true, roomId: room.id };
    });
  } catch (error) {
    if (error instanceof RoomError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function leaveRoom(roomId: string): Promise<RoomActionResult> {
  const me = await getCurrentPlayer();
  return withRoom(roomId, me.id, async (tx, room, members) => {
    requireRoom(room.status === "lobby", "You can only leave a room in the lobby.");
    if (room.hostId === me.id) {
      await tx.update(rooms).set({ status: "closed", updatedAt: new Date() }).where(eq(rooms.id, roomId));
    } else {
      await tx.delete(roomPlayers).where(and(eq(roomPlayers.roomId, roomId), eq(roomPlayers.playerId, me.id)));
      const remaining = members.filter((p) => p.playerId !== me.id);
      for (const [position, player] of remaining.entries()) {
        await tx.update(roomPlayers).set({ position }).where(and(eq(roomPlayers.roomId, roomId), eq(roomPlayers.playerId, player.playerId)));
      }
      await touch(tx, roomId);
    }
    return { ok: true };
  });
}

export async function closeRoom(roomId: string): Promise<RoomActionResult> {
  const me = await getCurrentPlayer();
  const result = await withRoom(roomId, me.id, async (tx, room, members) => {
    requireRoom(room.hostId === me.id, "Only the host can close the room.");
    if (room.gameId) {
      const game = await currentGame(tx, room);
      if (isGameFinished(room.mode, room.config, members.length, game.darts)) await saveFinished(tx, room, members, game);
    }
    await tx.update(rooms).set({ status: "closed", updatedAt: new Date() }).where(eq(rooms.id, roomId));
    return { ok: true };
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function startRoom(roomId: string): Promise<RoomActionResult> {
  const me = await getCurrentPlayer();
  return withRoom(roomId, me.id, async (tx, room, members) => {
    requireRoom(room.hostId === me.id, "Only the host can start the game.");
    requireRoom(room.status === "lobby", room.status === "closed" ? "The room is closed." : "The game has already started.");
    requireRoom(members.length >= 2, "At least two players are needed.");
    await tx.update(rooms).set({ status: "playing", gameId: randomUUID(), gameStartedAt: new Date(), updatedAt: new Date() }).where(eq(rooms.id, roomId));
    return { ok: true };
  });
}

export async function throwRoomDart(roomId: string, gameId: string, seq: number, dart: Dart): Promise<RoomActionResult> {
  const me = await getCurrentPlayer();
  const parsed = dartRequestSchema.safeParse({ roomId, gameId, seq, dart });
  if (!parsed.success) return { ok: false, error: "The dart data was malformed." };
  return withRoom(roomId, me.id, async (tx, room, members) => {
    requireRoom(room.status === "playing", "The room isn't playing.");
    requireRoom(room.gameId === gameId, "conflict");
    const game = await currentGame(tx, room);
    requireRoom(!game.saved, "This game is already saved.");
    requireRoom(seq === game.rows.length, "conflict");
    requireRoom(game.rows.length < 5000, "This game has reached the dart limit.");
    const turn = turnOf(room.mode, room.config, members.length, game.darts);
    requireRoom(turn !== null, "The game is already finished.");
    requireRoom(members[turn].playerId === me.id, "It's not your turn.");
    const valid = parsed.data.dart;
    requireRoom(!valid.v || room.mode === "x01", "Visit totals are only accepted in X01.");
    if (valid.v) {
      const state = replay(room.mode, room.config, members.length, game.darts);
      requireRoom(state.open === null, "Enter a visit total at the start of a visit.");
    }
    await tx.insert(roomDarts).values({ roomId, gameId, seq, playerId: me.id, dart: valid });
    return { ok: true };
  });
}

export async function undoRoomDart(roomId: string, gameId: string, seq: number): Promise<RoomActionResult> {
  const me = await getCurrentPlayer();
  if (!undoRequestSchema.safeParse({ roomId, gameId, seq }).success) return { ok: false, error: "The undo data was malformed." };
  return withRoom(roomId, me.id, async (tx, room) => {
    requireRoom(room.status === "playing", "The room isn't playing.");
    requireRoom(room.gameId === gameId, "conflict");
    const game = await currentGame(tx, room);
    requireRoom(!game.saved, "This game is already saved.");
    const last = game.rows.at(-1);
    requireRoom(last && last.seq === seq, "conflict");
    requireRoom(last.playerId === me.id, "You can only undo your own last dart.");
    await tx.delete(roomDarts).where(and(eq(roomDarts.roomId, roomId), eq(roomDarts.gameId, gameId), eq(roomDarts.seq, seq)));
    return { ok: true };
  });
}

export async function finishRoomGame(roomId: string): Promise<RoomActionResult> {
  const me = await getCurrentPlayer();
  const result = await withRoom(roomId, me.id, async (tx, room, members) => {
    const game = await currentGame(tx, room);
    requireRoom(isGameFinished(room.mode, room.config, members.length, game.darts), "The game isn't finished yet.");
    await saveFinished(tx, room, members, game);
    await touch(tx, roomId);
    return { ok: true };
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function rematchRoom(roomId: string): Promise<RoomActionResult> {
  const me = await getCurrentPlayer();
  const result = await withRoom(roomId, me.id, async (tx, room, members) => {
    requireRoom(room.status === "playing", "The room isn't playing.");
    const game = await currentGame(tx, room);
    requireRoom(isGameFinished(room.mode, room.config, members.length, game.darts), "The game isn't finished yet.");
    await saveFinished(tx, room, members, game);
    for (const [position, player] of rotate(members).entries()) {
      await tx.update(roomPlayers).set({ position }).where(and(eq(roomPlayers.roomId, roomId), eq(roomPlayers.playerId, player.playerId)));
    }
    await tx.update(rooms).set({ gameId: randomUUID(), gameStartedAt: new Date(), updatedAt: new Date() }).where(eq(rooms.id, roomId));
    return { ok: true };
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function roomSnapshot(roomId: string): Promise<RoomActionResult<{ room: RoomSnapshot }>> {
  const me = await getCurrentPlayer();
  return withRoom(roomId, me.id, async (tx) => {
    const room = await getRoomSnapshot(roomId, tx);
    requireRoom(room, "The room no longer exists.");
    return { ok: true, room };
  });
}

export async function videoToken(roomId: string): Promise<RoomActionResult<{ url: string; token: string }>> {
  const me = await getCurrentPlayer();
  return withRoom<{ url: string; token: string }>(roomId, me.id, async () => {
    const url = process.env.LIVEKIT_URL, key = process.env.LIVEKIT_API_KEY, secret = process.env.LIVEKIT_API_SECRET;
    if (!url || !key || !secret) return { ok: false, error: "video_unavailable" };
    const token = new AccessToken(key, secret, { identity: me.id, name: me.name, metadata: JSON.stringify({ color: me.color }), ttl: "6h" });
    token.addGrant({ roomJoin: true, room: `superdarts-${roomId}`, canPublish: true, canPublishSources: [TrackSource.MICROPHONE],
      canSubscribe: true, canPublishData: true, canUpdateOwnMetadata: true });
    return { ok: true, url, token: await token.toJwt() };
  });
}

const inviteTimes = new Map<string, number>();

export async function invitePlayer(roomId: string, playerId: string): Promise<RoomActionResult> {
  const me = await getCurrentPlayer();
  if (!idSchema.safeParse(playerId).success) return { ok: false, error: "Invalid player." };
  return withRoom(roomId, me.id, async (tx, room, members) => {
    requireRoom(room.status === "lobby", "You can only invite players to a lobby.");
    requireRoom(playerId !== me.id, "You can't invite yourself.");
    requireRoom(!members.some((p) => p.playerId === playerId), "That player is already in the room.");
    const [target] = await tx.select().from(players).where(eq(players.id, playerId));
    requireRoom(target && !target.bot && target.userId, "That player can't receive invites.");
    const now = Date.now(), pair = `${me.id}:${playerId}`;
    for (const [key, sentAt] of inviteTimes) if (now - sentAt >= 5000) inviteTimes.delete(key);
    requireRoom(!inviteTimes.has(pair), "Please wait a few seconds before inviting that player again.");
    const invite: RoomInvite = { id: randomUUID(), code: room.code,
      from: { id: me.id, name: me.name, color: me.color, avatarUrl: me.avatarUrl },
      title: `${gameTitle(room.mode, { ...room.config })}, ${gameDetail(room.mode, { ...room.config }).toLowerCase()}`, sentAt: now };
    // Reserve before awaiting SQL so concurrent invites from another room share the limit.
    inviteTimes.set(pair, now);
    try {
      await tx.execute(sql`select realtime.send(${JSON.stringify(invite)}::jsonb, 'invite', ${`player:${playerId}`}, true)`);
    } catch (error) {
      if (inviteTimes.get(pair) === now) inviteTimes.delete(pair);
      throw error;
    }
    return { ok: true };
  });
}

export async function cameraLink(roomId: string): Promise<RoomActionResult<CameraLink>> {
  const me = await getCurrentPlayer();
  return withRoom<CameraLink>(roomId, me.id, async (_tx, room) => {
    requireRoom(room.status !== "closed", "The room has closed.");
    const url = process.env.LIVEKIT_URL, key = process.env.LIVEKIT_API_KEY, secret = process.env.LIVEKIT_API_SECRET;
    if (!url || !key || !secret) return { ok: false, error: "video_unavailable" };
    const expiry = Math.floor(Date.now() / 1000) + 12 * 60 * 60;
    const token = signCameraToken({ r: room.id, p: me.id, e: expiry }, secret);
    return { ok: true, path: `/cam/${token}`, expiresAt: new Date(expiry * 1000).toISOString() };
  });
}

/** This bearer link is the phone's authorization; it deliberately needs no signed-in session. */
export async function cameraToken(token: string): Promise<RoomActionResult<CameraSession>> {
  const url = process.env.LIVEKIT_URL, key = process.env.LIVEKIT_API_KEY, secret = process.env.LIVEKIT_API_SECRET;
  if (!url || !key || !secret) return { ok: false, error: "video_unavailable" };
  const verified = verifyCameraToken(token, secret);
  if (!verified.ok) return { ok: false, error: verified.error === "expired"
    ? "This camera link has expired. Make a new one on the iPad." : "This camera link is invalid. Make a new one on the iPad." };
  const { r: roomId, p: playerId } = verified.payload;
  return withRoom<CameraSession>(roomId, playerId, async (tx, room) => {
    requireRoom(room.status !== "closed", "The room has closed.");
    const [player] = await tx.select().from(players).where(eq(players.id, playerId));
    requireRoom(player, "This player is no longer in the room. Make a new camera link on the iPad.");
    const access = new AccessToken(key, secret, { identity: cameraIdentity(playerId), name: `${player.name}'s camera`,
      metadata: JSON.stringify({ color: player.color, camera: true }), ttl: "6h" });
    access.addGrant({ roomJoin: true, room: `superdarts-${roomId}`, canPublish: true,
      // Subscribe is granted so the phone sees the iPad's `mic` attribute; it connects with autoSubscribe off, so no media flows to it.
      canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE], canSubscribe: true, canPublishData: false });
    return { ok: true, url, token: await access.toJwt(), roomCode: room.code,
      player: { id: player.id, name: player.name, color: player.color, avatarUrl: player.avatarUrl } };
  });
}
