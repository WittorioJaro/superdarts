import "server-only";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { darts, gamePlayers, games, players, turns } from "@/db/schema";
import type { ModeId } from "@/lib/darts/modes";
import { type StatTurn, scoringStats } from "@/lib/darts/stats";

export async function listPlayers() {
  return db
    .select({ id: players.id, name: players.name, color: players.color, avatarUrl: players.avatarUrl, userId: players.userId })
    .from(players)
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
  const mine = await db
    .select({ id: games.id })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(eq(gamePlayers.playerId, playerId))
    .orderBy(desc(games.finishedAt))
    .limit(limit);
  if (mine.length === 0) return [];

  const rows = await db.query.games.findMany({
    where: inArray(
      games.id,
      mine.map((g) => g.id),
    ),
    columns: { darts: false },
    orderBy: desc(games.finishedAt),
    with: { players: { with: { player: true }, orderBy: asc(gamePlayers.position) } },
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

  const turnRows = await db
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
    })
    .from(turns)
    .innerJoin(games, eq(games.id, turns.gameId))
    .where(and(eq(turns.playerId, playerId), inArray(games.mode, ["x01", "scoring"]), gameFilter));

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

  const doubleRows = await db
    .select({
      target: darts.target,
      attempts: sql<number>`count(*)::int`,
      hits: sql<number>`count(*) filter (where ${darts.hit})::int`,
      mode: games.mode,
    })
    .from(darts)
    .innerJoin(games, eq(games.id, darts.gameId))
    .where(and(eq(darts.playerId, playerId), eq(darts.atDouble, true), gameFilter))
    .groupBy(darts.target, games.mode);

  const checkoutAttempts = doubleRows.filter((r) => r.mode === "x01").reduce((n, r) => n + r.attempts, 0);
  const scoring = scoringStats(statTurns, checkoutAttempts);

  const doubles = new Map<number, { attempts: number; hits: number }>();
  for (const r of doubleRows) {
    if (r.target === null) continue;
    const d = doubles.get(r.target) ?? { attempts: 0, hits: 0 };
    d.attempts += r.attempts;
    d.hits += r.hits;
    doubles.set(r.target, d);
  }

  const heat = await db
    .select({ s: darts.segment, m: darts.multiplier, n: sql<number>`count(*)::int` })
    .from(darts)
    .innerJoin(games, eq(games.id, darts.gameId))
    .where(and(eq(darts.playerId, playerId), inArray(games.mode, ["x01", "scoring"]), gameFilter))
    .groupBy(darts.segment, darts.multiplier);

  const matchRows = await db
    .select({
      winner: gamePlayers.winner,
      legsWon: gamePlayers.legsWon,
      average: gamePlayers.average,
      finishedAt: games.finishedAt,
      kind: games.kind,
      mode: games.mode,
      gameId: games.id,
      legsPlayed: sql<number>`(select count(distinct ${turns.leg})::int from ${turns} where ${turns.gameId} = ${games.id})`,
    })
    .from(gamePlayers)
    .innerJoin(games, eq(games.id, gamePlayers.gameId))
    .where(and(eq(gamePlayers.playerId, playerId), gameFilter))
    .orderBy(asc(games.finishedAt));

  const matches = matchRows.filter((r) => r.kind === "match");
  const averages = matchRows
    .filter((r) => r.average !== null && (r.mode === "x01" || r.mode === "scoring"))
    .map((r) => ({ at: r.finishedAt, average: r.average!, kind: r.kind, gameId: r.gameId }));

  return {
    scoring,
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
    .groupBy(gamePlayers.playerId);
}
