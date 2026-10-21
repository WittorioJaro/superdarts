import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { darts, gamePlayers, games, players, turns, ratings, ratingChanges, rooms } from "@/db/schema";
import { buildRecords } from "@/lib/darts/records";
import { DEFAULT_RATING, updateRating } from "@/lib/ratings/glicko2";
import { configSchemas, saveGameSchema, type SaveGameInput } from "@/lib/darts/schemas";

export type SaveResult = { ok: true } | { ok: false; retry: boolean; error: string };
export type GameTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** An optional transaction keeps an online game's save and room transition atomic. */
export async function persistGame(input: SaveGameInput, createdBy: string, connection: typeof db | GameTransaction = db): Promise<SaveResult> {
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

  // Local saves must not bypass the authoritative room history with a guessed game id.
  if (connection === db) {
    const [room] = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.gameId, game.id)).limit(1);
    if (room) return { ok: false, retry: false, error: "Online games must be saved from their room." };
  }

  const known = await connection.select({ id: players.id, bot: players.bot }).from(players).where(inArray(players.id, game.playerIds));
  if (known.length !== game.playerIds.length) return { ok: false, retry: false, error: "A player no longer exists." };

  const hasBots = known.some((p) => p.bot !== null);
  const kind = hasBots ? "match" : game.kind;
  const ranked = kind === "match" && !!game.ranked && !hasBots;
  const rec = buildRecords(game.mode, config.data, game.playerIds, game.darts);
  if (kind === "match" && !rec.finished) {
    return { ok: false, retry: false, error: "Only finished matches are saved." };
  }

  await connection.transaction(async (tx) => {
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
        createdBy,
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
      const updates = rec.players.map((p) => {
        const prev = rating(p.playerId);
        const next = updateRating(prev, rec.players.filter((q) => q.playerId !== p.playerId).map((q) => {
          const a = placement(p), b = placement(q);
          const diff = a[0] - b[0] || a[1] - b[1];
          return { ...rating(q.playerId), score: diff > 0 ? 1 : diff < 0 ? 0 : 0.5 };
        }));
        return { playerId: p.playerId, ...next, games: prev.games + 1, updatedAt: new Date(),
          before: prev.rating };
      });
      await tx.insert(ratings).values(updates.map((r) => ({ playerId: r.playerId, rating: r.rating, rd: r.rd, vol: r.vol, games: r.games, updatedAt: r.updatedAt })))
        .onConflictDoUpdate({ target: ratings.playerId, set: { rating: sql`excluded.rating`, rd: sql`excluded.rd`,
          vol: sql`excluded.vol`, games: sql`excluded.games`, updatedAt: sql`excluded.updated_at` } });
      await tx.insert(ratingChanges).values(updates.map((r) => ({ gameId: game.id, playerId: r.playerId,
        before: r.before, after: r.rating, rdAfter: r.rd })));
    }
    for (let i = 0; i < rec.darts.length; i += 1000) {
      await tx.insert(darts).values(rec.darts.slice(i, i + 1000).map((d) => ({ ...d, gameId: game.id })));
    }
  });

  return { ok: true };
}
