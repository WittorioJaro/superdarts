import type { Dart } from "./board";
import { threeDartAverage } from "./engine";
import { type AnyConfig, MODES, type ModeId, replay, results } from "./modes";

/**
 * Everything the database stores about a game, derived by replaying its darts.
 * The device only sends darts, so stats can never disagree with the scoreboard.
 */
export function buildRecords(mode: ModeId, config: AnyConfig, playerIds: string[], darts: Dart[]) {
  const state = replay(mode, config as never, playerIds.length, darts);
  const res = results(mode, state as never, config as never);
  const info = MODES[mode];

  const players = playerIds.map((playerId, p) => {
    const mine = state.turns.filter((t) => t.player === p);
    const thrown = mine.reduce((n, t) => n + t.darts.length, 0);
    return {
      playerId,
      position: p,
      winner: res[p].winner,
      score: res[p].score,
      legsWon: res[p].legsWon,
      setsWon: res[p].setsWon,
      dartsThrown: thrown,
      points: mine.reduce((n, t) => n + (t.bust ? 0 : t.points), 0),
      average: info.scoring && thrown > 0 ? threeDartAverage(mine) : null,
    };
  });

  const turns = state.turns.map((t, seq) => ({
    playerId: playerIds[t.player],
    seq,
    set: t.set,
    leg: t.leg,
    visit: t.visit,
    points: t.bust ? 0 : t.points,
    dartsThrown: t.darts.length,
    startScore: t.startScore,
    bust: t.bust,
    checkout: t.checkout,
  }));

  const dartRows = state.turns.flatMap((t, seq) =>
    t.darts.map((d, idx) => ({
      playerId: playerIds[t.player],
      turnSeq: seq,
      idx,
      segment: d.s,
      multiplier: d.m,
      score: d.score,
      target: d.target,
      hit: d.hit,
      atDouble: d.atDouble,
    })),
  );

  const winner = state.winner !== null ? playerIds[state.winner] : null;
  return { finished: state.finished, winner, players, turns, darts: dartRows };
}
