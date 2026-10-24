"use server";

import { and, eq, gt, isNull, not, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { gamePlayers, players, pubTables } from "@/db/schema";
import { getCurrentAdmin } from "@/lib/auth";

const idSchema = z.uuid();
const nameSchema = z.string().trim().min(1).max(40);

/** Same as the host's list of open tables: an unused code that hasn't expired, or a live session.
 *  expires_at is null until the code is redeemed; coalesce it so `not(liveTable)` never comes out null. */
const liveTable = and(isNull(pubTables.closedAt), or(and(isNull(pubTables.tokenHash), gt(pubTables.codeExpiresAt, sql`now()`)),
  gt(sql`coalesce(${pubTables.expiresAt}, '-infinity'::timestamptz)`, sql`now()`)))!;

function changed() {
  revalidatePath("/", "layout");
}

export async function renamePlayer(id: unknown, name: unknown) {
  const admin = await getCurrentAdmin();
  if (!admin) return { ok: false as const, error: "Only admins can edit players." };
  const parsedId = idSchema.safeParse(id);
  const parsedName = nameSchema.safeParse(name);
  if (!parsedId.success) return { ok: false as const, error: "Unknown player." };
  if (!parsedName.success) return { ok: false as const, error: "Name can't be empty." };
  const updated = await db.update(players).set({ name: parsedName.data }).where(eq(players.id, parsedId.data)).returning({ id: players.id });
  if (!updated.length) return { ok: false as const, error: "That player no longer exists." };
  changed();
  return { ok: true as const };
}

/** Only players without history can go, so no one else's games, stats or ratings change. */
export async function deletePlayer(id: unknown) {
  const admin = await getCurrentAdmin();
  if (!admin) return { ok: false as const, error: "Only admins can edit players." };
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false as const, error: "Unknown player." };
  if (parsed.data === admin.id) return { ok: false as const, error: "You can't delete yourself." };

  const error = await db.transaction(async (tx) => {
    const [player] = await tx.select({ id: players.id }).from(players).where(eq(players.id, parsed.data)).for("update");
    if (!player) return "That player no longer exists.";
    const played = await tx.$count(gamePlayers, eq(gamePlayers.playerId, parsed.data));
    if (played) return `They've played ${played} saved ${played === 1 ? "game" : "games"}, so they can't be deleted.`;
    const atTable = await tx.$count(pubTables, and(liveTable, or(eq(pubTables.hostId, parsed.data),
      sql`${pubTables.playerIds} @> ${JSON.stringify([parsed.data])}::jsonb`)));
    if (atTable) return "They're on an open pub table. Close it first.";
    try {
      await tx.transaction(async (sp) => {
        // Closed or expired tables they hosted can't be used again, and would otherwise block the delete.
        await sp.delete(pubTables).where(and(eq(pubTables.hostId, parsed.data), not(liveTable)));
        await sp.delete(players).where(eq(players.id, parsed.data));
      });
    } catch (e) {
      if (foreignKeyViolation(e)) return "They're still linked to a room, table or invite, so they can't be deleted.";
      throw e;
    }
    return null;
  });
  if (error) return { ok: false as const, error };
  changed();
  return { ok: true as const };
}

function foreignKeyViolation(e: unknown): boolean {
  for (let err = e as { code?: string; cause?: unknown } | undefined; err; err = err.cause as typeof err) {
    if (err.code === "23503") return true;
  }
  return false;
}
