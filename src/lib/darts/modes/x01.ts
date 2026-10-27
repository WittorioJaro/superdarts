import { type Dart, dartScore, isValidDart } from "../board";
import { isCheckoutPossible, type OutMode } from "../checkout";
import { type BaseState, type PlayerResult, closeTurn, currentTurn, newBaseState, openTurn, scored } from "../engine";

export interface X01Config {
  startScore: number;
  out: OutMode;
  /** Legs needed to win a set (or the match when `sets` is 1). */
  legs: number;
  /** Sets needed to win the match. */
  sets: number;
}

export interface X01State extends BaseState {
  set: number;
  leg: number;
  legInSet: number;
  remaining: number[];
  legsWon: number[];
  setsWon: number[];
  totalLegsWon: number[];
}

export const X01_DEFAULTS: X01Config = { startScore: 501, out: "double", legs: 3, sets: 1 };

export function x01Init(config: X01Config, players: number): X01State {
  return {
    ...newBaseState(players),
    set: 0,
    leg: 0,
    legInSet: 0,
    remaining: Array(players).fill(config.startScore),
    legsWon: Array(players).fill(0),
    setsWon: Array(players).fill(0),
    totalLegsWon: Array(players).fill(0),
  };
}

function isFinishingDart(d: Dart, out: OutMode) {
  if (out === "single") return d.m > 0;
  if (out === "master") return d.m === 2 || d.m === 3;
  return d.m === 2;
}

/** The score left that a single double would finish, if any. */
export function doubleTarget(remaining: number): number | null {
  if (remaining === 50) return 25;
  if (remaining >= 2 && remaining <= 40 && remaining % 2 === 0) return remaining / 2;
  return null;
}

/** Score left for a player, including darts already thrown this visit. */
export function liveRemaining(state: X01State, player: number): number {
  const turn = currentTurn(state);
  if (turn && turn.player === player && !turn.bust) return turn.startScore! - turn.points;
  return state.remaining[player];
}

export function x01Apply(state: X01State, dart: Dart, config: X01Config) {
  if (state.finished) return;
  if (dart.v) return applyVisitTotal(state, dart, config);
  state.event = null;
  const p = state.current;
  const turn = openTurn(state, {
    set: state.set,
    leg: state.leg,
    startScore: state.remaining[p],
  });

  const before = turn.startScore! - turn.points;
  const score = dartScore(dart);
  const after = before - score;
  const target = config.out === "single" ? null : doubleTarget(before);
  const finishes = after === 0 && isFinishingDart(dart, config.out);

  turn.darts.push(
    scored(dart, {
      atDouble: target !== null,
      target,
      hit: target !== null ? finishes : null,
    }),
  );

  const minLeft = config.out === "single" ? 1 : 2;
  if (after < 0 || (after > 0 && after < minLeft) || (after === 0 && !finishes)) {
    turn.bust = true;
    state.event = { type: "bust", player: p };
    closeTurn(state);
    return;
  }

  turn.points += score;

  if (finishes) {
    turn.checkout = true;
    state.remaining[p] = 0;
    closeTurn(state, false);
    winLeg(state, p, config);
    return;
  }

  if (turn.darts.length === 3) {
    state.remaining[p] = after;
    if (turn.points === 180) state.event = { type: "max", player: p };
    closeTurn(state);
  }
}

function winLeg(state: X01State, p: number, config: X01Config) {
  state.legsWon[p] += 1;
  state.totalLegsWon[p] += 1;
  state.event = { type: "leg", player: p };

  if (state.legsWon[p] >= config.legs) {
    state.setsWon[p] += 1;
    if (state.setsWon[p] >= config.sets) {
      state.finished = true;
      state.winner = p;
      state.event = { type: "match", player: p };
      return;
    }
    if (config.sets > 1) state.event = { type: "set", player: p };
    state.set += 1;
    state.legInSet = 0;
    state.legsWon.fill(0);
  } else {
    state.legInSet += 1;
  }

  state.leg += 1;
  state.remaining.fill(config.startScore);
  // The throw rotates every leg, and every set starts with the next player in line.
  state.current = (state.set + state.legInSet) % state.players;
}

export function x01Results(state: X01State, config: X01Config): PlayerResult[] {
  return Array.from({ length: state.players }, (_, p) => ({
    score: config.sets > 1 ? state.setsWon[p] : state.totalLegsWon[p],
    legsWon: state.totalLegsWon[p],
    setsWon: state.setsWon[p],
    winner: state.winner === p,
  }));
}

/** Questions needed before accepting a whole visit; totals only start at a visit boundary. */
export function visitTotalNeeds(state: X01State, config: X01Config, total: number): { darts: boolean; atDouble: boolean } {
  const remaining = liveRemaining(state, state.current);
  // Only a finishing visit asks; a missed finish records no darts at a double.
  const finishes = total === remaining && isCheckoutPossible(remaining, 3, config.out);
  return { darts: finishes, atDouble: finishes && config.out !== "single" };
}

function applyVisitTotal(state: X01State, dart: Dart, config: X01Config) {
  if (state.open !== null || !isValidDart(dart)) return;
  const v = dart.v!;
  const p = state.current;
  const before = state.remaining[p];
  const after = before - v.total;
  const finishes = after === 0 && isCheckoutPossible(before, v.darts, config.out);
  const turn = openTurn(state, { set: state.set, leg: state.leg, startScore: before });
  // Unknown landings and double targets stay unknown; records omit this entry from darts rows.
  const attempts = config.out === "single" ? 0 : Math.max(v.atDouble, finishes && config.out === "double" ? 1 : 0);
  turn.darts.push({ ...scored(dart), v: { ...v, atDouble: attempts }, score: v.total });
  state.event = null;
  if (after < 0 || (after === 1 && config.out !== "single") || (after === 0 && !finishes)) {
    turn.bust = true;
    state.event = { type: "bust", player: p };
    closeTurn(state);
    return;
  }
  turn.points = v.total;
  state.remaining[p] = after;
  turn.checkout = finishes;
  closeTurn(state, !finishes);
  if (finishes) winLeg(state, p, config);
  else if (v.total === 180) state.event = { type: "max", player: p };
}
