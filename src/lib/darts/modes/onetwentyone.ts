import { type Dart, dartScore } from "../board";
import { type BaseState, type PlayerResult, closeTurn, newBaseState, openTurn, scored } from "../engine";
import { doubleTarget } from "./x01";

export interface OneTwentyOneConfig { start: number; attempts: number; darts: 9 | 6 | 3; onFail: "stay" | "reset" }
export interface OneTwentyOneState extends BaseState {
  attempt: number; target: number; remaining: number; used: number; results: { target: number; success: boolean; darts: number }[];
}
export const ONETWENTYONE_DEFAULTS: OneTwentyOneConfig = { start: 121, attempts: 10, darts: 9, onFail: "stay" };
export function onetwentyoneInit(config: OneTwentyOneConfig, players: number): OneTwentyOneState {
  return { ...newBaseState(players), attempt: 0, target: config.start, remaining: config.start, used: 0, results: [] };
}

export function onetwentyoneApply(state: OneTwentyOneState, dart: Dart, config: OneTwentyOneConfig) {
  if (state.finished || dart.v) return;
  state.event = null;
  const turn = openTurn(state, { leg: state.attempt, startScore: state.remaining });
  const target = doubleTarget(state.remaining);
  const after = state.remaining - dartScore(dart);
  const success = after === 0 && dart.m === 2;
  turn.darts.push(scored(dart, { target, atDouble: target !== null, hit: target !== null ? success : null }));
  state.used++;
  if (after < 0 || after === 1 || (after === 0 && !success)) {
    turn.bust = true;
    state.remaining = turn.startScore!;
    state.event = { type: "bust", player: 0 };
    // A bust forfeits the unthrown darts of this visit, consuming that visit's budget.
    state.used += Math.min(3 - turn.darts.length, config.darts - state.used);
    closeTurn(state, false);
  } else {
    state.remaining = after;
    turn.points += dartScore(dart);
    if (success) { turn.checkout = true; state.event = { type: "hit", player: 0 }; }
    if (turn.darts.length === 3) closeTurn(state, false);
  }
  if (!success && state.used < config.darts) return;
  state.results.push({ target: state.target, success, darts: state.turns.filter((t) => t.leg === state.attempt).reduce((n, t) => n + t.darts.length, 0) });
  state.attempt++;
  closeTurn(state, false);
  if (state.attempt >= config.attempts) { state.finished = true; return; }
  state.target = success ? state.target + 1 : config.onFail === "reset" ? config.start : state.target;
  state.remaining = state.target;
  state.used = 0;
}

export function onetwentyoneResults(state: OneTwentyOneState): PlayerResult[] {
  return [{ score: Math.max(0, ...state.results.filter((r) => r.success).map((r) => r.target)), legsWon: 0, setsWon: 0, winner: false }];
}
