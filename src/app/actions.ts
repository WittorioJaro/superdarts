"use server";

import { eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { darts, gamePlayers, games, players, turns, ratings, ratingChanges } from "@/db/schema";
import { getCurrentPlayer } from "@/lib/auth";
import { pickColor } from "@/lib/colors";
import { buildRecords } from "@/lib/darts/records";
import { type BotProfile, type BotModel, levelModel } from "@/lib/darts/bot";
import { ghostModel } from "@/lib/queries";
import { DEFAULT_RATING, updateRating } from "@/lib/ratings/glicko2";
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

  if (!["x01", "cricket"].includes(game.mode) && game.playerIds.length !== 1) {
    return { ok: false, retry: false, error: "This drill requires one player." };
  }

  const known = await db.select({ id: players.id, bot: players.bot }).from(players).where(inArray(players.id, game.playerIds));
  if (known.length !== game.playerIds.length) return { ok: false, retry: false, error: "A player no longer exists." };

  const hasBots = known.some((p) => p.bot !== null);
  const kind = hasBots ? "match" : game.kind;
  const ranked = kind === "match" && !!game.ranked && !hasBots;
  const rec = buildRecords(game.mode, config.data, game.playerIds, game.darts);
  if (kind === "match" && !rec.finished) {
    return { ok: false, retry: false, error: "Only finished matches are saved." };
  }

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(games)
      .values({
        id: game.id,
        kind,
        ranked,
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
    if (ranked && game.mode === "x01" && "startScore" in config.data && config.data.startScore === 501 && known.length >= 2) {
      // Serialize rating periods, including first-ever ratings, in stable player order.
      for (const id of [...game.playerIds].sort()) await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`);
      const before = await tx.select().from(ratings).where(inArray(ratings.playerId, game.playerIds));
      const rating = (id: string) => before.find((r) => r.playerId === id) ?? { ...DEFAULT_RATING, games: 0 };
      const placement = (p: typeof rec.players[number]) => [p.setsWon, p.legsWon];
      for (const p of rec.players) {
        const prev = rating(p.playerId);
        const next = updateRating(prev, rec.players.filter((q) => q.playerId !== p.playerId).map((q) => {
          const a = placement(p), b = placement(q);
          const diff = a[0] - b[0] || a[1] - b[1];
          return { ...rating(q.playerId), score: diff > 0 ? 1 : diff < 0 ? 0 : 0.5 };
        }));
        await tx.insert(ratings).values({ playerId: p.playerId, ...next, games: prev.games + 1 })
          .onConflictDoUpdate({ target: ratings.playerId, set: { ...next, games: prev.games + 1, updatedAt: new Date() } });
        await tx.insert(ratingChanges).values({ gameId: game.id, playerId: p.playerId, before: prev.rating, after: next.rating, rdAfter: next.rd });
      }
    }
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

const botProfileSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("level"), average: z.number().int().min(20).max(120) }),
  z.object({ kind: z.literal("ghost"), of: z.uuid(), from: z.iso.datetime(), to: z.iso.datetime() })
    .refine((p) => new Date(p.from) < new Date(p.to), "The ghost date range is empty"),
]);

export async function ensureBot(profile: BotProfile): Promise<{ id: string; name: string; color: string; avatarUrl: null; model: BotModel }> {
  await getCurrentPlayer();
  const p = botProfileSchema.parse(profile);
  const source = p.kind === "ghost" ? await db.query.players.findFirst({ where: eq(players.id, p.of) }) : null;
  if (p.kind === "ghost" && (!source || source.bot)) throw new Error("Ghosts require a real player");
  const model = p.kind === "level" ? levelModel(p.average) : await ghostModel(p.of, p.from, p.to);
  const name =
    p.kind === "level" ? `Bot ${p.average}` : `${source!.name.split(" ")[0]}, last ${Math.round((+new Date(p.to) - +new Date(p.from)) / 86400000) - 1} days`;
  const bot = await db.transaction(async (tx) => {
    const key = JSON.stringify(p);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 1))`);
    const [existing] = await tx.select().from(players).where(sql`${players.bot} = ${key}::jsonb`).limit(1);
    if (existing) return existing;
    const [created] = await tx.insert(players).values({ name, color: "#64748b", bot: p }).returning();
    return created;
  });
  return { id: bot.id, name: bot.name, color: bot.color, avatarUrl: null, model };
}
