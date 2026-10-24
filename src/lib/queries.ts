import "server-only";
import { cache } from "react";
import { and, asc, desc, eq, gte, inArray, isNull, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { darts, gamePlayers, games, players, turns, ratings, ratingChanges } from "@/db/schema";
import { BOARD_ORDER, type Dart } from "@/lib/darts/board";
import { type BotModel, levelModel } from "@/lib/darts/bot";
import { replay, type AnyConfig, type ModeId } from "@/lib/darts/modes";
import { type StatTurn, scoringStats, cricketMpr } from "@/lib/darts/stats";

/** Players with a Google account. Guests are one-off and only show up in the games they played. */
export async function listPlayers() {
  return db
    .select({ id: players.id, name: players.name, color: players.color, avatarUrl: players.avatarUrl, userId: players.userId })
    .from(players)
    .where(isNotNull(players.userId))
    .orderBy(asc(players.name));
}

/** Everyone but bots, for the admin player list. */
export async function listAllPlayers() {
  return db
    .select({
      id: players.id, name: players.name, color: players.color, avatarUrl: players.avatarUrl, userId: players.userId,
      games: sql<number>`(select count(*)::int from ${gamePlayers} where ${gamePlayers.playerId} = ${players.id})`,
    })
    .from(players)
    .where(isNull(players.bot))
    .orderBy(asc(players.name));
}

export async function getPlayer(id: string) {
  return db.query.players.findFirst({ where: eq(players.id, id) });
}

export interface GameRow {
  id: string;
  kind: "practice" | "match";
  mode: ModeId;
  config: Record<string, unknown>;
  status: string;
  finishedAt: Date;
  players: { id: string; name: string; color: string; score: number; average: number | null; winner: boolean; legsWon: number; setsWon: number }[];
}

export async function recentGames(playerId: string, limit = 8): Promise<GameRow[]> {
  const mine = db
    .select({ id: games.id })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(eq(gamePlayers.playerId, playerId))
    .orderBy(desc(games.finishedAt))
    .limit(limit);

  const rows = await db.query.games.findMany({
    where: inArray(games.id, mine),
    columns: { darts: false },
    orderBy: desc(games.finishedAt),
    with: { players: { with: { player: { columns: { name: true, color: true } } }, orderBy: asc(gamePlayers.position) } },
  });

  return rows.map((g) => ({
    id: g.id,
    kind: g.kind,
    mode: g.mode as ModeId,
    config: g.config as Record<string, unknown>,
    status: g.status,
    finishedAt: g.finishedAt,
    players: g.players.map((gp) => ({
      id: gp.playerId,
      name: gp.player.name,
      color: gp.player.color,
      score: gp.score,
      average: gp.average,
      winner: gp.winner,
      legsWon: gp.legsWon,
      setsWon: gp.setsWon,
    })),
  }));
}

export type StatsScope = "all" | "match" | "practice";
export type StatsRange = "all" | "30d";

/** Scoring and finishing stats across every X01 and free-throw visit in scope. */
export async function playerStats(playerId: string, scope: StatsScope, range: StatsRange) {
  const since = range === "30d" ? new Date(Date.now() - 30 * 24 * 3600 * 1000) : null;
  const gameFilter = and(
    scope === "all" ? undefined : eq(games.kind, scope),
    since ? gte(games.finishedAt, since) : undefined,
  );

  const [turnRows, doubleRows, heat, matchRows, cricketGames] = await Promise.all([
    db
      .select({
        gameId: turns.gameId,
        leg: turns.leg,
        visit: turns.visit,
        points: turns.points,
        darts: turns.dartsThrown,
        bust: turns.bust,
        checkout: turns.checkout,
        startScore: turns.startScore,
        mode: games.mode,
        atDouble: turns.atDouble,
        legacyAttempts: sql<number>`(select count(*)::int from ${darts} where ${darts.gameId} = ${turns.gameId} and ${darts.turnSeq} = ${turns.seq} and ${darts.atDouble})`,
      })
      .from(turns)
      .innerJoin(games, eq(games.id, turns.gameId))
      .where(and(eq(turns.playerId, playerId), inArray(games.mode, ["x01", "scoring"]), gameFilter)),
    db
      .select({
        target: darts.target,
        attempts: sql<number>`count(*)::int`,
        hits: sql<number>`count(*) filter (where ${darts.hit})::int`,
        mode: games.mode,
      })
      .from(darts)
      .innerJoin(games, eq(games.id, darts.gameId))
      .where(and(eq(darts.playerId, playerId), eq(darts.atDouble, true), gameFilter))
      .groupBy(darts.target, games.mode),
    db
      .select({ s: darts.segment, m: darts.multiplier, n: sql<number>`count(*)::int` })
      .from(darts)
      .innerJoin(games, eq(games.id, darts.gameId))
      .where(and(eq(darts.playerId, playerId), inArray(games.mode, ["x01", "scoring"]), gameFilter))
      .groupBy(darts.segment, darts.multiplier),
    db
      .select({
        winner: gamePlayers.winner,
        legsWon: gamePlayers.legsWon,
        average: gamePlayers.average,
        finishedAt: games.finishedAt,
        kind: games.kind,
        mode: games.mode,
        gameId: games.id,
        botFree: sql<boolean>`${noBots()}`,
        legsPlayed: sql<number>`(select count(distinct ${turns.leg})::int from ${turns} where ${turns.gameId} = ${games.id})`,
      })
      .from(gamePlayers)
      .innerJoin(games, eq(games.id, gamePlayers.gameId))
      .where(and(eq(gamePlayers.playerId, playerId), gameFilter))
      .orderBy(asc(games.finishedAt)),
    cricketTurns(playerId, scope, range),
  ]);

  // Free throw has no finishing, so it only feeds the scoring numbers.
  const statTurns: StatTurn[] = turnRows.map((t) => ({
    points: t.points,
    darts: t.darts,
    bust: t.bust,
    checkout: t.mode === "x01" && t.checkout,
    startScore: t.mode === "x01" ? t.startScore : null,
    visit: t.mode === "x01" ? t.visit : 99,
    legKey: `${t.gameId}:${t.leg}`,
  }));

  const checkoutAttempts = turnRows.filter((r) => r.mode === "x01").reduce((n, r) => n + Math.max(r.atDouble, r.legacyAttempts), 0);
  const scoring = scoringStats(statTurns, checkoutAttempts);

  const doubles = new Map<number, { attempts: number; hits: number }>();
  for (const r of doubleRows) {
    if (r.target === null) continue;
    const d = doubles.get(r.target) ?? { attempts: 0, hits: 0 };
    d.attempts += r.attempts;
    d.hits += r.hits;
    doubles.set(r.target, d);
  }

  const matches = matchRows.filter((r) => r.kind === "match" && r.botFree);
  const cricketVisits = cricketGames.flatMap((g) => g.turns);
  const averages = matchRows
    .filter((r) => r.average !== null && (r.mode === "x01" || r.mode === "scoring"))
    .map((r) => ({ at: r.finishedAt, average: r.average!, kind: r.kind, gameId: r.gameId }));

  return {
    scoring,
    cricket: { mpr: cricketMpr(cricketVisits), games: cricketGames.length },
    doubles,
    heat,
    averages,
    matches: {
      played: matches.length,
      won: matches.filter((m) => m.winner).length,
      legsWon: matches.reduce((n, m) => n + m.legsWon, 0),
      legsPlayed: matches.reduce((n, m) => n + m.legsPlayed, 0),
      form: matches.slice(-10).map((m) => m.winner),
    },
  };
}

/** Every practice session per drill, oldest first, for bests and trends. */
export async function practiceHistory(playerId: string) {
  const rows = await db
    .select({
      mode: games.mode,
      config: games.config,
      score: gamePlayers.score,
      average: gamePlayers.average,
      darts: gamePlayers.dartsThrown,
      status: games.status,
      finishedAt: games.finishedAt,
    })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(and(eq(gamePlayers.playerId, playerId), eq(games.kind, "practice")))
    .orderBy(asc(games.finishedAt));
  return rows.map((r) => ({ ...r, mode: r.mode as ModeId, config: r.config as Record<string, unknown> }));
}

/** Headline numbers for the player list. */
export async function playerSummaries() {
  return db
    .select({
      playerId: gamePlayers.playerId,
      games: sql<number>`count(*)::int`,
      average: sql<number | null>`sum(${gamePlayers.points}) filter (where ${gamePlayers.average} is not null)::float * 3 / nullif(sum(${gamePlayers.dartsThrown}) filter (where ${gamePlayers.average} is not null), 0)`,
      wins: sql<number>`count(*) filter (where ${gamePlayers.winner} and ${games.kind} = 'match')::int`,
      lastPlayed: sql<Date>`max(${games.finishedAt})`,
    })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .innerJoin(players, eq(players.id, gamePlayers.playerId))
    .where(and(isNull(players.bot), noBots()))
    .groupBy(gamePlayers.playerId);
}

/** Correlated to games: competitive views exclude the entire game when any participant is a bot. */
function noBots() {
  return sql`not exists (select 1 from game_players bp join players b on b.id = bp.player_id where bp.game_id = ${games.id} and b.bot is not null)`;
}
function sinceRange(range: StatsRange) { return range === "30d" ? gte(games.finishedAt, new Date(Date.now() - 30 * 86400000)) : undefined; }

export async function listBots() {
  return db.select({ id: players.id, name: players.name, color: players.color, avatarUrl: players.avatarUrl, bot: players.bot })
    .from(players).where(isNotNull(players.bot)).orderBy(asc(players.name));
}

export async function ratingHistory(playerId: string): Promise<{ at: Date; rating: number; gameId: string }[]> {
  return db.select({ at: ratingChanges.createdAt, rating: ratingChanges.after, gameId: ratingChanges.gameId }).from(ratingChanges)
    .where(eq(ratingChanges.playerId, playerId)).orderBy(asc(ratingChanges.createdAt), asc(ratingChanges.gameId));
}

export async function getGame(id: string): Promise<{
  id: string; kind: "practice" | "match"; mode: ModeId; config: AnyConfig; ranked: boolean; startedAt: Date; finishedAt: Date; status: string;
  players: { id: string; name: string; color: string; avatarUrl: string | null; position: number; winner: boolean; score: number;
    legsWon: number; setsWon: number; average: number | null }[]; darts: Dart[];
} | null> {
  const g = await db.query.games.findFirst({ where: eq(games.id, id),
    with: { players: { with: { player: { columns: { name: true, color: true, avatarUrl: true } } }, orderBy: asc(gamePlayers.position) } } });
  if (!g) return null;
  return { id: g.id, kind: g.kind, mode: g.mode as ModeId, config: g.config as AnyConfig, ranked: g.ranked, startedAt: g.startedAt,
    finishedAt: g.finishedAt, status: g.status, darts: g.darts as Dart[], players: g.players.map((p) => ({ id: p.playerId, name: p.player.name,
      color: p.player.color, avatarUrl: p.player.avatarUrl, position: p.position, winner: p.winner, score: p.score,
      legsWon: p.legsWon, setsWon: p.setsWon, average: p.average })) };
}

/** Group landings before sending target history to the server; the same counts feed both profile views. */
const targetLandings = cache(async (playerId: string, range: StatsRange) => {
  const aimM = sql<number>`((${games.config}->'targets'->${turns.leg})->>'m')::int`;
  return db.select({ s: darts.segment, m: darts.multiplier, hit: darts.hit, target: darts.target, aimM,
    n: sql<number>`count(*)::int` })
    .from(darts).innerJoin(games, eq(games.id, darts.gameId))
    .innerJoin(turns, and(eq(turns.gameId, darts.gameId), eq(turns.seq, darts.turnSeq)))
    .where(and(eq(darts.playerId, playerId), eq(games.mode, "target"), sinceRange(range)))
    .groupBy(darts.segment, darts.multiplier, darts.hit, darts.target, aimM);
});

export async function targetSpread(playerId: string, target: { s: number; m: 1 | 2 | 3 }, range: StatsRange): Promise<{
  total: number; hits: number; landings: { s: number; m: number; n: number }[]; left: number; right: number; ring: number; other: number;
}> {
  const rows = (await targetLandings(playerId, range)).filter((d) => d.target === target.s && d.aimM === target.m);
  const counts = new Map<string, { s: number; m: number; n: number }>();
  const result = { total: 0, hits: 0, landings: [] as { s: number; m: number; n: number }[], left: 0, right: 0, ring: 0, other: 0 };
  const i = BOARD_ORDER.indexOf(target.s);
  for (const d of rows) {
    result.total += d.n;
    const key = `${d.s}:${d.m}`;
    const landing = counts.get(key) ?? { s: d.s, m: d.m, n: 0 };
    landing.n += d.n; counts.set(key, landing);
    if (d.hit) result.hits += d.n;
    else if (d.s === target.s) result.ring += d.n; // Inner and outer singles cannot be distinguished in the input.
    else if (i >= 0 && d.s === BOARD_ORDER[(i + 19) % 20]) result.left += d.n;
    else if (i >= 0 && d.s === BOARD_ORDER[(i + 1) % 20]) result.right += d.n;
    else result.other += d.n;
  }
  result.landings = [...counts.values()].sort((a, b) => a.s - b.s || a.m - b.m);
  return result;
}

export async function practiceTargets(playerId: string): Promise<{ s: number; m: number; total: number; hits: number }[]> {
  const targets = new Map<string, { s: number; m: number; total: number; hits: number }>();
  for (const d of await targetLandings(playerId, "all")) {
    if (d.target === null) continue;
    const key = `${d.target}:${d.aimM}`;
    const t = targets.get(key) ?? { s: d.target, m: d.aimM, total: 0, hits: 0 };
    t.total += d.n; t.hits += d.hit ? d.n : 0; targets.set(key, t);
  }
  return [...targets.values()].sort((a, b) => b.total - a.total || b.s - a.s || b.m - a.m);
}

export async function practiceVsMatch(playerId: string): Promise<{ week: Date; practiceDarts: number; matchAverage: number | null }[]> {
  const week = new Date();
  week.setUTCHours(0, 0, 0, 0);
  week.setUTCDate(week.getUTCDate() - (week.getUTCDay() + 6) % 7 - 25 * 7);
  const rows = await db.select({ at: games.finishedAt, kind: games.kind, mode: games.mode, points: gamePlayers.points, darts: gamePlayers.dartsThrown })
    .from(gamePlayers).innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(and(eq(gamePlayers.playerId, playerId), gte(games.finishedAt, week), noBots()));
  return Array.from({ length: 26 }, (_, i) => {
    const start = new Date(+week + i * 7 * 86400000);
    const bucket = rows.filter((r) => +r.at >= +start && +r.at < +start + 7 * 86400000);
    const matches = bucket.filter((r) => r.kind === "match" && r.mode === "x01");
    const darts = matches.reduce((n, r) => n + r.darts, 0);
    return { week: start, practiceDarts: bucket.filter((r) => r.kind === "practice").reduce((n, r) => n + r.darts, 0),
      matchAverage: darts ? matches.reduce((n, r) => n + r.points, 0) * 3 / darts : null };
  });
}

export async function fatigue(playerId: string): Promise<{ fromMinute: number; toMinute: number; average: number; darts: number }[]> {
  const mine = db.select({ id: games.id }).from(gamePlayers).innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(and(eq(gamePlayers.playerId, playerId), inArray(games.mode, ["x01", "scoring"])));
  const starts = db.$with("session_starts").as(db.select({ gameId: darts.gameId,
    first: sql<Date>`min(${darts.thrownAt})`.as("first") }).from(darts)
    .where(inArray(darts.gameId, mine)).groupBy(darts.gameId));
  const minute = sql`extract(epoch from (${darts.thrownAt} - ${starts.first})) / 60`;
  const bucket = sql<number>`case when ${minute} < 0 then -1 when ${minute} < 5 then 0 when ${minute} < 10 then 1
    when ${minute} < 15 then 2 when ${minute} < 20 then 3 when ${minute} < 30 then 4 when ${minute} < 45 then 5 else 6 end`;
  const rows = await db.with(starts).select({ bucket,
    points: sql<number>`sum(case when ${turns.bust} then 0 else ${darts.score} end)::float`,
    n: sql<number>`count(*)::int` }).from(darts).innerJoin(starts, eq(starts.gameId, darts.gameId))
    .innerJoin(turns, and(eq(turns.gameId, darts.gameId), eq(turns.seq, darts.turnSeq)))
    .where(and(eq(darts.playerId, playerId), isNotNull(darts.thrownAt))).groupBy(bucket);
  const bounds = [0, 5, 10, 15, 20, 30, 45, Number.MAX_SAFE_INTEGER];
  return rows.filter((r) => r.bucket >= 0).sort((a, b) => a.bucket - b.bucket).map((r) => ({
    fromMinute: bounds[r.bucket], toMinute: bounds[r.bucket + 1], average: r.points * 3 / r.n, darts: r.n,
  }));
}

export async function ghostModel(playerId: string, from: string, to: string): Promise<BotModel> {
  const [[counts], [volume]] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int`,
      scoring: sql<number>`count(*) filter (where not ${darts.atDouble})::int`,
      trebles: sql<number>`count(*) filter (where not ${darts.atDouble} and ${darts.segment} = 20 and ${darts.multiplier} = 3)::int`,
      twenties: sql<number>`count(*) filter (where not ${darts.atDouble} and ${darts.segment} = 20)::int`,
      doubles: sql<number>`count(*) filter (where ${darts.atDouble} and ${darts.target} is distinct from 25)::int`,
      doubleHits: sql<number>`count(*) filter (where ${darts.atDouble} and ${darts.target} is distinct from 25 and ${darts.hit})::int`,
      bulls: sql<number>`count(*) filter (where ${darts.atDouble} and ${darts.target} = 25)::int`,
      bullHits: sql<number>`count(*) filter (where ${darts.atDouble} and ${darts.target} = 25 and ${darts.hit})::int`,
    }).from(darts).innerJoin(games, eq(games.id, darts.gameId)).innerJoin(players, eq(players.id, darts.playerId))
      .where(and(eq(darts.playerId, playerId), isNull(players.bot), eq(games.mode, "x01"),
        gte(games.finishedAt, new Date(from)), lte(games.finishedAt, new Date(to)))),
    db.select({ points: sql<number>`coalesce(sum(${gamePlayers.points}), 0)::float`,
      darts: sql<number>`coalesce(sum(${gamePlayers.dartsThrown}), 0)::int` }).from(gamePlayers).innerJoin(games, eq(games.id, gamePlayers.gameId))
      .where(and(eq(gamePlayers.playerId, playerId), eq(games.mode, "x01"), gte(games.finishedAt, new Date(from)), lte(games.finishedAt, new Date(to)))),
  ]);
  const fallback = levelModel(volume.darts ? volume.points * 3 / volume.darts : 60);
  if (counts.total < 90) return { ...fallback, label: "Ghost (estimated)" };
  // Non-finishing darts approximate T20 intent; setup singles are inseparable from scoring misses.
  return { trebleRate: counts.scoring ? counts.trebles / counts.scoring : fallback.trebleRate,
    singleRate: counts.scoring ? counts.twenties / counts.scoring : fallback.singleRate,
    doubleRate: counts.doubles >= 9 ? counts.doubleHits / counts.doubles : fallback.doubleRate,
    bullRate: counts.bulls >= 9 ? counts.bullHits / counts.bulls : fallback.bullRate, label: "Ghost" };
}

/** Competitive stats come from grouped visits; aggregate-entry attempts use turns, old saves fall back to darts. */
async function competitiveStats(range: StatsRange, gameIds?: string[]) {
  const filter = and(eq(games.kind, "match"), eq(games.mode, "x01"), noBots(), sinceRange(range), gameIds ? inArray(games.id, gameIds) : undefined);
  return db.select({ playerId: turns.playerId,
    points: sql<number>`sum(${turns.points})::float`, darts: sql<number>`sum(${turns.dartsThrown})::int`,
    firstPoints: sql<number>`coalesce(sum(${turns.points}) filter (where ${turns.visit} < 3), 0)::float`,
    firstDarts: sql<number>`coalesce(sum(${turns.dartsThrown}) filter (where ${turns.visit} < 3), 0)::int`,
    checkouts: sql<number>`count(*) filter (where ${turns.checkout})::int`,
    attempts: sql<number>`sum(greatest(${turns.atDouble}, (select count(*) from darts ad where ad.game_id = ${turns.gameId} and ad.turn_seq = ${turns.seq} and ad.at_double)))::int`,
    highestCheckout: sql<number>`coalesce(max(${turns.startScore}) filter (where ${turns.checkout}), 0)::int`,
    n180: sql<number>`count(*) filter (where ${turns.points} = 180 and not ${turns.bust})::int`,
  }).from(turns).innerJoin(games, eq(games.id, turns.gameId)).where(filter).groupBy(turns.playerId);
}

export async function leaderboard(range: StatsRange): Promise<{
  playerId: string; name: string; color: string; avatarUrl: string | null; matches: number; wins: number; average: number | null;
  first9: number | null; checkoutPct: number | null; highestCheckout: number; n180: number; rating: number | null; rd: number | null;
}[]> {
  const [people, totals, stats] = await Promise.all([
    db.select({ playerId: players.id, name: players.name, color: players.color, avatarUrl: players.avatarUrl, rating: ratings.rating, rd: ratings.rd })
      .from(players).leftJoin(ratings, eq(ratings.playerId, players.id)).where(isNotNull(players.userId)),
    db.select({ playerId: gamePlayers.playerId, matches: sql<number>`count(*)::int`, wins: sql<number>`count(*) filter (where ${gamePlayers.winner})::int` })
      .from(gamePlayers).innerJoin(games, eq(games.id, gamePlayers.gameId))
      .where(and(eq(games.kind, "match"), noBots(), sinceRange(range))).groupBy(gamePlayers.playerId),
    competitiveStats(range),
  ]);
  const byStats = new Map(stats.map((r) => [r.playerId, r]));
  const byTotals = new Map(totals.map((r) => [r.playerId, r]));
  return people.map((p) => {
    const s = byStats.get(p.playerId), t = byTotals.get(p.playerId);
    return { ...p, matches: t?.matches ?? 0, wins: t?.wins ?? 0, average: s?.darts ? s.points * 3 / s.darts : null,
      first9: s?.firstDarts ? s.firstPoints * 3 / s.firstDarts : null, checkoutPct: s?.attempts ? s.checkouts * 100 / s.attempts : null,
      highestCheckout: s?.highestCheckout ?? 0, n180: s?.n180 ?? 0 };
  }).sort((a, b) => (b.rating ?? -Infinity) - (a.rating ?? -Infinity) || (b.average ?? -Infinity) - (a.average ?? -Infinity) || a.name.localeCompare(b.name));
}

export async function headToHead(aId: string, bId: string): Promise<{
  matches: number; winsA: number; winsB: number; streak: { playerId: string; count: number } | null;
  a: { average: number | null; highestCheckout: number; n180: number; checkoutPct: number | null };
  b: { average: number | null; highestCheckout: number; n180: number; checkoutPct: number | null }; games: GameRow[];
}> {
  const rows = aId === bId ? [] : await db.query.games.findMany({
    where: and(eq(games.kind, "match"), noBots(),
      sql`exists (select 1 from game_players a where a.game_id = ${games.id} and a.player_id = ${aId})`,
      sql`exists (select 1 from game_players b where b.game_id = ${games.id} and b.player_id = ${bId})`),
    columns: { darts: false }, orderBy: desc(games.finishedAt),
    with: { players: { with: { player: { columns: { name: true, color: true } } }, orderBy: asc(gamePlayers.position) } },
  });
  const stats = rows.length ? await competitiveStats("all", rows.map((g) => g.id)) : [];
  const side = (id: string) => { const s = stats.find((r) => r.playerId === id); return {
    average: s?.darts ? s.points * 3 / s.darts : null, highestCheckout: s?.highestCheckout ?? 0,
    n180: s?.n180 ?? 0, checkoutPct: s?.attempts ? s.checkouts * 100 / s.attempts : null }; };
  let streak: { playerId: string; count: number } | null = null;
  for (const g of rows) {
    if (g.winnerId !== aId && g.winnerId !== bId) break;
    if (!streak) streak = { playerId: g.winnerId, count: 1 };
    else if (streak.playerId === g.winnerId) streak.count++;
    else break;
  }
  return { matches: rows.length, winsA: rows.filter((g) => g.winnerId === aId).length, winsB: rows.filter((g) => g.winnerId === bId).length,
    streak, a: side(aId), b: side(bId), games: rows.map((g) => ({ id: g.id, kind: g.kind, mode: g.mode as ModeId,
      config: g.config as Record<string, unknown>, status: g.status, finishedAt: g.finishedAt, players: g.players.map((p) => ({
        id: p.playerId, name: p.player.name, color: p.player.color, score: p.score, average: p.average,
        winner: p.winner, legsWon: p.legsWon, setsWon: p.setsWon })) })) };
}

export async function weaknessTargets(playerId: string, limit = 5) {
  return (await allWeaknessTargets(playerId)).slice(0, Math.max(0, limit));
}

const allWeaknessTargets = cache(async (playerId: string): Promise<{ s: number; m: 1 | 2 | 3; attempts: number; hits: number; rate: number }[]> => {
  const [practice, doubles] = await Promise.all([
    practiceTargets(playerId),
    db.select({ s: darts.target, attempts: sql<number>`count(*)::int`, hits: sql<number>`count(*) filter (where ${darts.hit})::int` })
      .from(darts).innerJoin(games, eq(games.id, darts.gameId))
      .where(and(eq(darts.playerId, playerId), eq(darts.atDouble, true), isNotNull(darts.target), sql`${games.mode} <> 'target'`)).groupBy(darts.target),
  ]);
  const targets = new Map<string, { s: number; m: 1 | 2 | 3; attempts: number; hits: number; rate: number }>();
  for (const r of practice) targets.set(`${r.s}:${r.m}`, { s: r.s, m: r.m as 1 | 2 | 3, attempts: r.total, hits: r.hits, rate: r.total ? r.hits / r.total : 0 });
  for (const r of doubles) {
    if (r.s === null) continue;
    const key = `${r.s}:2`;
    const t = targets.get(key) ?? { s: r.s, m: 2 as const, attempts: 0, hits: 0, rate: 0 };
    t.attempts += r.attempts; t.hits += r.hits; t.rate = t.hits / t.attempts; targets.set(key, t);
  }
  // Only explicit aims count: no inferred T20 intent from free throw or X01 setup darts.
  const measured = [...targets.values()].filter((t) => t.attempts >= 9).sort((a, b) => a.rate - b.rate || b.attempts - a.attempts || b.s - a.s);
  const defaults = [{ s: 20, m: 3 }, { s: 20, m: 2 }, { s: 16, m: 2 }, { s: 19, m: 3 }, { s: 25, m: 2 }] as const;
  for (const d of defaults) if (!measured.some((t) => t.s === d.s && t.m === d.m)) measured.push({ ...d, attempts: 0, hits: 0, rate: 0 });
  return measured;
});

export async function todaysTraining(playerId: string): Promise<{
  minutes: number; steps: { mode: ModeId; config: AnyConfig; title: string; reason: string; minutes: number }[];
}> {
  const band = sql<number>`case when ${turns.startScore} <= 80 then 41 else 81 end`;
  const [weak, finishes] = await Promise.all([
    weaknessTargets(playerId, 10),
    db.select({ min: band, checkouts: sql<number>`count(*) filter (where ${turns.checkout})::int`,
      attempts: sql<number>`sum(greatest(${turns.atDouble}, (select count(*) from darts ad where ad.game_id = ${turns.gameId} and ad.turn_seq = ${turns.seq} and ad.at_double)))::int` })
      .from(turns).innerJoin(games, eq(games.id, turns.gameId))
      .where(and(eq(turns.playerId, playerId), eq(games.mode, "x01"), gte(turns.startScore, 41), lte(turns.startScore, 120))).groupBy(band),
  ]);
  const treble = weak.find((t) => t.m === 3) ?? { s: 20, m: 3 as const, rate: 0, attempts: 0 };
  const doubles = weak.filter((t) => t.m === 2).slice(0, 2);
  for (const s of [20, 16]) if (doubles.length < 2 && !doubles.some((t) => t.s === s)) doubles.push({ s, m: 2, attempts: 0, hits: 0, rate: 0 });
  const reason = (t: typeof treble) => t.attempts ? `You hit ${t.s === 25 ? "Bull" : `${t.m === 3 ? "T" : "D"}${t.s}`} ${(t.rate * 100).toFixed(0)}% of the time (${t.attempts} darts)` : "Build a baseline for this target";
  const ranges = [{ min: 41, max: 80 }, { min: 81, max: 120 }].map((r) => {
    const totals = finishes.find((f) => f.min === r.min);
    const attempts = totals?.attempts ?? 0;
    return { ...r, attempts, rate: attempts ? totals!.checkouts / attempts : 1 };
  }).sort((a, b) => a.rate - b.rate || a.min - b.min);
  const range = ranges[0];
  // Fixed targets make the same player's plan replay identically throughout the day.
  let seed = [...`${playerId}:${new Date().toISOString().slice(0, 10)}`].reduce((n, ch) => Math.imul(n, 31) + ch.charCodeAt(0) | 0, 0);
  const pool = Array.from({ length: range.max - range.min + 1 }, (_, i) => range.min + i);
  const targets = Array.from({ length: 10 }, () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return pool[(seed >>> 0) % pool.length]; });
  return { minutes: 20, steps: [
    { mode: "scoring", config: { rounds: 10 }, title: "Warm up", reason: "Find your rhythm with ten scoring visits", minutes: 3 },
    { mode: "target", config: { targets: [{ s: treble.s, m: 3 }], dartsPerTarget: 60 }, title: `Work on T${treble.s}`, reason: reason(treble), minutes: 6 },
    { mode: "target", config: { targets: doubles.map((t) => ({ s: t.s, m: 2 as const })), dartsPerTarget: 30 }, title: "Doubles practice",
      reason: [...new Set(doubles.map(reason))].join("; "), minutes: 6 },
    { mode: "checkout", config: { min: range.min, max: range.max, darts: 6, targets }, title: `Finishes ${range.min}–${range.max}`,
      reason: range.attempts ? `Your checkout rate in this range is ${(range.rate * 100).toFixed(0)}%` : "Practise turning a setup into a finish", minutes: 5 },
  ] };
}

export async function achievements(playerId: string): Promise<{ id: string; title: string; description: string; achievedAt: Date | null; value: string | null }[]> {
  const [sessions, visits, throws] = await Promise.all([
    db.select({ id: games.id, kind: games.kind, mode: games.mode, config: games.config, at: games.finishedAt, average: gamePlayers.average,
      darts: gamePlayers.dartsThrown, botFree: sql<boolean>`${noBots()}` }).from(gamePlayers).innerJoin(games, eq(games.id, gamePlayers.gameId))
      .where(eq(gamePlayers.playerId, playerId)).orderBy(asc(games.finishedAt)),
    db.select({ gameId: turns.gameId, leg: turns.leg, seq: turns.seq, visit: turns.visit, points: turns.points, darts: turns.dartsThrown,
      start: turns.startScore, checkout: turns.checkout, bust: turns.bust, at: games.finishedAt, mode: games.mode })
      .from(turns).innerJoin(games, eq(games.id, turns.gameId)).where(eq(turns.playerId, playerId)).orderBy(asc(games.finishedAt), asc(turns.seq)),
    db.select({ gameId: darts.gameId, seq: darts.turnSeq, idx: darts.idx, atDouble: darts.atDouble, hit: darts.hit,
      s: darts.segment, m: darts.multiplier, at: games.finishedAt, mode: games.mode })
      .from(darts).innerJoin(games, eq(games.id, darts.gameId)).where(eq(darts.playerId, playerId))
      .orderBy(asc(games.finishedAt), asc(darts.turnSeq), asc(darts.idx)),
  ]);
  type Award = { id: string; title: string; description: string; achievedAt: Date | null; value: string | null };
  const awards: Award[] = [];
  const add = (id: string, title: string, description: string, at?: Date | null, value?: string | number | null) =>
    awards.push({ id, title, description, achievedAt: at ?? null, value: value === undefined || value === null ? null : String(value) });
  const scoringVisits = visits.filter((t) => (t.mode === "x01" || t.mode === "scoring") && !t.bust);
  const max = scoringVisits.find((t) => t.points === 180);
  add("first-180", "Maximum!", "Score your first 180", max?.at, max ? 180 : null);
  const checkouts = visits.filter((t) => t.mode === "x01" && t.checkout);
  const ton = checkouts.find((t) => (t.start ?? 0) >= 100);
  add("ton-checkout", "Ton-plus finish", "Check out 100 or more in X01", ton?.at, ton?.start);
  const highest = [...checkouts].sort((a, b) => (b.start ?? 0) - (a.start ?? 0) || +a.at - +b.at)[0];
  add("highest-checkout", "Highest checkout", "Your highest X01 checkout", highest?.at, highest?.start);
  const bestAvg = sessions.filter((g) => g.kind === "match" && g.mode === "x01" && g.botFree && g.darts >= 9 && g.average !== null)
    .sort((a, b) => b.average! - a.average! || +a.at - +b.at)[0];
  add("best-average", "Best match average", "Best three-dart average in an X01 match, minimum nine darts", bestAvg?.at, bestAvg?.average?.toFixed(2));
  const legs = new Map<string, { start: number | null; darts: number; won: boolean; at: Date }>();
  for (const t of visits.filter((t) => t.mode === "x01")) {
    const key = `${t.gameId}:${t.leg}`;
    const leg = legs.get(key) ?? { start: t.start, darts: 0, won: false, at: t.at };
    leg.darts += t.darts; leg.won ||= t.checkout; legs.set(key, leg);
  }
  const bestLeg = [...legs.values()].filter((l) => l.start === 501 && l.won).sort((a, b) => a.darts - b.darts || +a.at - +b.at)[0];
  add("best-501-leg", "Fewest-darts 501", "Your fastest completed 501 leg", bestLeg?.at, bestLeg?.darts);
  let run = 0, longest = 0;
  let doubleAt: Date | null = null;
  let lastGame = "";
  const byVisit = new Map<string, typeof throws>();
  for (const d of throws) {
    const key = `${d.gameId}:${d.seq}`;
    const group = byVisit.get(key) ?? [];
    group.push(d); byVisit.set(key, group);
  }
  for (const t of visits) {
    if (t.gameId !== lastGame) run = 0;
    lastGame = t.gameId;
    const group = byVisit.get(`${t.gameId}:${t.seq}`) ?? [];
    // Unknown aggregate landings cannot establish or bridge a consecutive-doubles record.
    if (group.length < t.darts) { run = 0; continue; }
    for (const d of group.filter((d) => d.atDouble)) {
      run = d.hit ? run + 1 : 0;
      if (run > longest) { longest = run; doubleAt = d.at; }
    }
  }
  add("double-streak", "Doubles streak", "Most consecutive successful double attempts within a session", doubleAt, longest || null);
  const dates = [...new Set(sessions.filter((g) => g.kind === "practice").map((g) => g.at.toISOString().slice(0, 10)))];
  let streak = 0, best = 0;
  let bestAt: Date | null = null;
  for (let i = 0; i < dates.length; i++) {
    streak = i > 0 && +new Date(dates[i]) - +new Date(dates[i - 1]) === 86400000 ? streak + 1 : 1;
    if (streak > best) { best = streak; bestAt = sessions.find((g) => g.kind === "practice" && g.at.toISOString().startsWith(dates[i]))!.at; }
  }
  add("longest-practice-streak", "Practice habit", "Longest run of consecutive UTC days practising", bestAt, best || null);
  const today = new Date().toISOString().slice(0, 10);
  const last = dates.at(-1);
  const current = last && +new Date(today) - +new Date(last) <= 86400000 ? streak : 0;
  const latestPractice = sessions.find((g) => g.kind === "practice" && g.at.toISOString().slice(0, 10) === last);
  add("current-practice-streak", "Keep it going", "Current practice streak, including yesterday if today is still open", current ? latestPractice?.at : null, current || null);
  const matches = sessions.filter((g) => g.kind === "match" && g.botFree);
  add("100-matches", "Match centurion", "Play 100 matches against real players", matches[99]?.at, matches.length);
  for (const count of [1000, 10000]) {
    let total = 0;
    const reached = sessions.find((g) => { total += g.darts; return total >= count; });
    add(`${count}-darts`, `${count.toLocaleString("en-US")} darts`, `Throw ${count.toLocaleString("en-US")} darts`, reached?.at,
      sessions.reduce((n, g) => n + g.darts, 0));
  }
  const challenge = visits.find((t) => t.mode === "onetwentyone" && t.checkout &&
    (visits.find((v) => v.gameId === t.gameId && v.leg === t.leg)?.start ?? 0) >= 130);
  add("121-130", "Raising the bar", "Finish a target of at least 130 in the 121 challenge", challenge?.at,
    challenge ? visits.find((v) => v.gameId === challenge.gameId && v.leg === challenge.leg)?.start : null);
  const cricket = await cricketTurns(playerId, "all", "all");
  const nine = cricket.flatMap((g) => g.turns.map((t) => ({ n: t.darts.reduce((n, d) => n + (d.marks ?? 0), 0), at: g.at })))
    .find((v) => v.n >= 9);
  add("nine-mark-cricket", "Nine marks", "Hit a nine-mark cricket visit", nine?.at, nine ? 9 : null);
  return awards;
}

/** Replaying raw cricket preserves whether marks were useful once a number closed for everyone. */
const cricketTurns = cache(async (playerId: string, scope: StatsScope = "all", range: StatsRange = "all") => {
  const rows = await db.select({ config: games.config, darts: games.darts, at: games.finishedAt, position: gamePlayers.position,
    players: sql<number>`(select count(*)::int from game_players cp where cp.game_id = ${games.id})` })
    .from(gamePlayers).innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(and(eq(gamePlayers.playerId, playerId), eq(games.mode, "cricket"), scope === "all" ? undefined : eq(games.kind, scope), sinceRange(range))).orderBy(asc(games.finishedAt));
  return rows.map((g) => ({ at: g.at, turns: replay("cricket", g.config as import("./darts/modes/cricket").CricketConfig, g.players, g.darts as Dart[])
    .turns.filter((t) => t.player === g.position) }));
});
