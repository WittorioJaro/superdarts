import { type Dart } from "../board";
import { type BaseState, type PlayerResult, closeTurn, dartsThrown, newBaseState, openTurn, scored } from "../engine";

export const CRICKET_NUMBERS = [20, 19, 18, 17, 16, 15, 25] as const;
export interface CricketConfig { variant: "standard" | "cutthroat"; legs: number }
export interface CricketState extends BaseState { leg: number; legsWon: number[]; marks: number[][]; points: number[] }
export const CRICKET_DEFAULTS: CricketConfig = { variant: "standard", legs: 1 };

export function cricketInit(_: CricketConfig, players: number): CricketState {
  return { ...newBaseState(players), leg: 0, legsWon: Array(players).fill(0), marks: Array.from({ length: players }, () => Array(7).fill(0)),
    points: Array(players).fill(0) };
}

export function cricketApply(state: CricketState, dart: Dart, config: CricketConfig) {
  if (state.finished || dart.v) return;
  state.event = null;
  const p = state.current;
  const turn = openTurn(state, { leg: state.leg });
  const i = CRICKET_NUMBERS.findIndex((n) => n === dart.s);
  let marks = 0;
  if (i >= 0 && dart.m > 0) {
    const closing = Math.min(dart.m, 3 - state.marks[p][i]);
    const extra = dart.m - closing;
    marks = closing;
    state.marks[p][i] = Math.min(3, state.marks[p][i] + dart.m);
    const opponents = state.marks.map((m, j) => j !== p && m[i] < 3 ? j : -1).filter((j) => j >= 0);
    if (state.players > 1 && opponents.length) {
      marks += extra;
      const points = extra * dart.s;
      turn.points += config.variant === "cutthroat" ? points * opponents.length : points;
      if (config.variant === "standard") state.points[p] += points;
      else for (const j of opponents) state.points[j] += points;
    }
  }
  turn.darts.push(scored(dart, { target: i >= 0 ? dart.s : null, hit: marks > 0, marks }));
  // A leg can also be won when an opponent's cut-throat scoring changes the standings.
  const winner = state.marks.findIndex((m, j) => m.every((n) => n === 3) && (state.players === 1 ||
    state.points.every((points) => config.variant === "standard" ? state.points[j] >= points : state.points[j] <= points)));
  if (winner >= 0) {
    turn.checkout = true;
    state.legsWon[winner]++;
    closeTurn(state, false);
    if (state.legsWon[winner] >= config.legs) {
      state.finished = true;
      state.winner = winner;
      state.event = { type: "match", player: winner };
    } else {
      state.event = { type: "leg", player: winner };
      state.leg++;
      state.current = state.leg % state.players;
      state.marks.forEach((m) => m.fill(0));
      state.points.fill(0);
    }
  } else if (turn.darts.length === 3) closeTurn(state);
}

export function cricketResults(state: CricketState): PlayerResult[] {
  return Array.from({ length: state.players }, (_, p) => ({ score: state.players === 1 ? dartsThrown(state, p) : state.legsWon[p],
    legsWon: state.legsWon[p], setsWon: 0, winner: state.winner === p }));
}

export { cricketMpr } from "../stats";
