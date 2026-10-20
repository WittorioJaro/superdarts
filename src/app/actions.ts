"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { darts, gamePlayers, games, players, turns } from "@/db/schema";
import { getCurrentPlayer } from "@/lib/auth";
import { pickColor } from "@/lib/colors";
import { buildRecords } from "@/lib/darts/records";
import { configSchemas, saveGameSchema } from "@/lib/darts/schemas";

export type SaveResult = { ok: true } | { ok: false; retry: boolean; error: string };

export async function saveGame(input: unknown): Promise<SaveResult> {
  const me = await getCurrentPlayer();

  const parsed = saveGameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, retry: false, error: "The game data was malformed." };
  const game = parsed.data;
  const config = configSchemas[game.mode].safeParse(game.config);
  if (!config.success) return { ok: false, retry: false, error: "The game settings were malformed." };
  if (new Set(game.playerIds).size !== game.playerIds.length) {
    return { ok: false, retry: false, error: "A player was listed twice." };
  }

  const known = await db.select({ id: players.id }).from(players).where(inArray(players.id, game.playerIds));
  if (known.length !== game.playerIds.length) return { ok: false, retry: false, error: "A player no longer exists." };

  const rec = buildRecords(game.mode, config.data, game.playerIds, game.darts);
  if (game.kind === "match" && !rec.finished) {
    return { ok: false, retry: false, error: "Only finished matches are saved." };
  }

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(games)
      .values({
        id: game.id,
        kind: game.kind,
        mode: game.mode,
        config: config.data,
        status: rec.finished ? "finished" : "stopped",
        winnerId: rec.winner,
        createdBy: me.id,
        startedAt: new Date(game.startedAt),
        darts: game.darts,
      })
      .onConflictDoNothing()
      .returning({ id: games.id });
    // Already saved by an earlier attempt.
    if (inserted.length === 0) return;

    await tx.insert(gamePlayers).values(rec.players.map((p) => ({ ...p, gameId: game.id })));
    if (rec.turns.length) await tx.insert(turns).values(rec.turns.map((t) => ({ ...t, gameId: game.id })));
    for (let i = 0; i < rec.darts.length; i += 1000) {
      await tx.insert(darts).values(rec.darts.slice(i, i + 1000).map((d) => ({ ...d, gameId: game.id })));
    }
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

const guestSchema = z.object({ name: z.string().trim().min(1).max(40) });

export async function addGuest(name: string) {
  await getCurrentPlayer();
  const parsed = guestSchema.safeParse({ name });
  if (!parsed.success) return { ok: false as const, error: "Give the player a name." };
  const count = await db.$count(players);
  const [player] = await db
    .insert(players)
    .values({ name: parsed.data.name, color: pickColor(count) })
    .returning({ id: players.id, name: players.name, color: players.color, avatarUrl: players.avatarUrl });
  revalidatePath("/", "layout");
  return { ok: true as const, player };
}

const profileSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export async function updateProfile(input: { name: string; color: string }) {
  const me = await getCurrentPlayer();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Name can't be empty." };
  await db.update(players).set(parsed.data).where(eq(players.id, me.id));
  revalidatePath("/", "layout");
  return { ok: true as const };
}
