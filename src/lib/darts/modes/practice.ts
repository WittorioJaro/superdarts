import { type Dart, dartScore } from "../board";
import { isCheckoutPossible } from "../checkout";
import { type BaseState, type PlayerResult, closeTurn, newBaseState, openTurn, scored } from "../engine";
import { doubleTarget } from "./x01";

/* ---------------------------------------------------------------- Free throw */

export interface ScoringConfig {
  /** Number of visits, or 0 to throw until you stop. */
  rounds: number;
}

export type ScoringState = BaseState;

export function scoringInit(_: ScoringConfig, players: number): ScoringState {
  return newBaseState(players);
}

export function scoringApply(state: ScoringState, dart: Dart, config: ScoringConfig) {
  if (state.finished || dart.v) return;
  state.event = null;
  const turn = openTurn(state, { visit: state.turns.length });
  turn.darts.push(scored(dart));
  turn.points += dartScore(dart);
  if (turn.darts.length < 3) return;
  if (turn.points === 180) state.event = { type: "max", player: 0 };
  closeTurn(state);
  if (config.rounds > 0 && state.turns.length >= config.rounds) state.finished = true;
}

export function scoringResults(state: ScoringState): PlayerResult[] {
  return [{ score: state.turns.reduce((n, t) => n + t.points, 0), legsWon: 0, setsWon: 0, winner: false }];
}

/* ---------------------------------------------------------- Around the clock */

export interface AroundConfig {
  ring: "any" | "double" | "treble";
}

export interface AroundState extends BaseState {
  targets: number[];
  index: number;
}

export function aroundInit(config: AroundConfig, players: number): AroundState {
  const numbers = Array.from({ length: 20 }, (_, i) => i + 1);
  return { ...newBaseState(players), targets: config.ring === "treble" ? numbers : [...numbers, 25], index: 0 };
}

function aroundHit(d: Dart, target: number, ring: AroundConfig["ring"]) {
  if (d.s !== target) return false;
  if (ring === "double") return d.m === 2;
  if (ring === "treble") return d.m === 3;
  return d.m > 0;
}

export function aroundApply(state: AroundState, dart: Dart, config: AroundConfig) {
  if (state.finished || dart.v) return;
  state.event = null;
  const turn = openTurn(state, { visit: state.turns.length });
  const target = state.targets[state.index];
  const hit = aroundHit(dart, target, config.ring);
  turn.darts.push(scored(dart, { target, hit, atDouble: config.ring === "double" }));
  if (hit) {
    turn.points += 1;
    state.index += 1;
    state.event = { type: "hit", player: 0 };
    if (state.index >= state.targets.length) {
      state.finished = true;
      turn.checkout = true;
      closeTurn(state, false);
      return;
    }
  }
  if (turn.darts.length === 3) closeTurn(state);
}

export function aroundResults(state: AroundState): PlayerResult[] {
  const darts = state.turns.reduce((n, t) => n + t.darts.length, 0);
  return [{ score: darts, legsWon: 0, setsWon: 0, winner: state.finished }];
}

/* ------------------------------------------------------------------ Bob's 27 */

export type BobsConfig = Record<string, never>;

export interface BobsState extends BaseState {
  round: number;
  score: number;
  /** Score after each completed round, for the progress strip. */
  history: number[];
}

export const BOBS_TARGETS = [...Array.from({ length: 20 }, (_, i) => i + 1), 25];

export function bobsInit(_: BobsConfig, players: number): BobsState {
  return { ...newBaseState(players), round: 0, score: 27, history: [] };
}

export function bobsApply(state: BobsState, dart: Dart) {
  if (state.finished || dart.v) return;
  state.event = null;
  const target = BOBS_TARGETS[state.round];
  const turn = openTurn(state, { visit: state.round, startScore: state.score });
  const hit = dart.s === target && dart.m === 2;
  turn.darts.push(scored(dart, { target, hit, atDouble: true }));
  if (hit) {
    turn.points += target * 2;
    state.event = { type: "hit", player: 0 };
  }
  if (turn.darts.length < 3) return;

  const value = target * 2;
  state.score += turn.points > 0 ? turn.points : -value;
  if (turn.points === 0) turn.points = -value;
  state.history.push(state.score);
  state.round += 1;
  closeTurn(state);
  if (state.score <= 0) {
    state.finished = true;
    state.event = { type: "out", player: 0 };
  } else if (state.round >= BOBS_TARGETS.length) {
    state.finished = true;
  }
}

export function bobsResults(state: BobsState): PlayerResult[] {
  return [{ score: state.score, legsWon: 0, setsWon: 0, winner: state.score > 0 && state.finished }];
}

/* ----------------------------------------------------------------- Doubles */

export interface DoublesConfig {
  order: "sequence" | "random";
  /** The doubles to throw at, fixed when the session starts so it replays the same way. */
  targets: number[];
}

export interface DoublesState extends BaseState {
  index: number;
  hits: Record<number, number>;
}

export function doublesTargets(order: DoublesConfig["order"]): number[] {
  const all = [...Array.from({ length: 20 }, (_, i) => i + 1), 25];
  if (order === "sequence") return all;
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

export function doublesInit(_: DoublesConfig, players: number): DoublesState {
  return { ...newBaseState(players), index: 0, hits: {} };
}

export function doublesApply(state: DoublesState, dart: Dart, config: DoublesConfig) {
  if (state.finished || dart.v) return;
  state.event = null;
  const target = config.targets[state.index];
  const turn = openTurn(state, { visit: state.index });
  const hit = dart.s === target && dart.m === 2;
  turn.darts.push(scored(dart, { target, hit, atDouble: true }));
  if (hit) {
    turn.points += 1;
    state.hits[target] = (state.hits[target] ?? 0) + 1;
    state.event = { type: "hit", player: 0 };
  }
  if (turn.darts.length < 3) return;
  state.index += 1;
  closeTurn(state);
  if (state.index >= config.targets.length) state.finished = true;
}

export function doublesResults(state: DoublesState): PlayerResult[] {
  const hits = state.turns.reduce((n, t) => n + t.points, 0);
  return [{ score: hits, legsWon: 0, setsWon: 0, winner: false }];
}

/* ---------------------------------------------------------------- Checkouts */

export interface CheckoutConfig {
  min: number;
  max: number;
  /** Darts allowed per finish: one, two or three visits. */
  darts: 3 | 6 | 9;
  targets: number[];
}

export interface CheckoutState extends BaseState {
  attempt: number;
  remaining: number;
  used: number;
  results: boolean[];
}

export function checkoutTargets(min: number, max: number, count: number): number[] {
  const pool: number[] = [];
  for (let n = min; n <= max; n++) if (isCheckoutPossible(n, 3)) pool.push(n);
  return Array.from({ length: count }, () => pool[Math.floor(Math.random() * pool.length)]);
}

export function checkoutInit(config: CheckoutConfig, players: number): CheckoutState {
  return { ...newBaseState(players), attempt: 0, remaining: config.targets[0], used: 0, results: [] };
}

export function checkoutApply(state: CheckoutState, dart: Dart, config: CheckoutConfig) {
  if (state.finished || dart.v) return;
  state.event = null;
  const turn = openTurn(state, { leg: state.attempt, startScore: state.remaining });
  const before = state.remaining;
  const after = before - dartScore(dart);
  const target = doubleTarget(before);
  const finishes = after === 0 && dart.m === 2;
  turn.darts.push(scored(dart, { atDouble: target !== null, target, hit: target !== null ? finishes : null }));
  state.used += 1;

  const bust = after < 0 || after === 1 || (after === 0 && !finishes);
  if (bust) {
    turn.bust = true;
    state.event = { type: "bust", player: 0 };
    return endAttempt(state, config, false);
  }
  state.remaining = after;
  turn.points += dartScore(dart);
  if (finishes) {
    turn.checkout = true;
    state.event = { type: "hit", player: 0 };
    return endAttempt(state, config, true);
  }
  if (state.used >= config.darts) return endAttempt(state, config, false);
  if (turn.darts.length === 3) closeTurn(state, false);
}

function endAttempt(state: CheckoutState, config: CheckoutConfig, success: boolean) {
  closeTurn(state, false);
  state.results.push(success);
  state.attempt += 1;
  state.used = 0;
  if (state.attempt >= config.targets.length) {
    state.finished = true;
    return;
  }
  state.remaining = config.targets[state.attempt];
}

export function checkoutResults(state: CheckoutState): PlayerResult[] {
  return [{ score: state.results.filter(Boolean).length, legsWon: 0, setsWon: 0, winner: false }];
}

/* ----------------------------------------------------------------- Shanghai */

export interface ShanghaiConfig {
  rounds: 7 | 20;
}

export interface ShanghaiState extends BaseState {
  round: number;
  score: number;
  shanghais: number;
}

export function shanghaiInit(_: ShanghaiConfig, players: number): ShanghaiState {
  return { ...newBaseState(players), round: 0, score: 0, shanghais: 0 };
}

export function shanghaiApply(state: ShanghaiState, dart: Dart, config: ShanghaiConfig) {
  if (state.finished || dart.v) return;
  state.event = null;
  const target = state.round + 1;
  const turn = openTurn(state, { visit: state.round });
  const hit = dart.s === target && dart.m > 0;
  turn.darts.push(scored(dart, { target, hit }));
  if (hit) {
    turn.points += dartScore(dart);
    state.score += dartScore(dart);
    state.event = { type: "hit", player: 0 };
  }
  if (turn.darts.length < 3) return;
  const rings = new Set(turn.darts.filter((d) => d.hit).map((d) => d.m));
  if (rings.size === 3) {
    state.shanghais += 1;
    turn.checkout = true;
    state.event = { type: "max", player: 0 };
  }
  state.round += 1;
  closeTurn(state);
  if (state.round >= config.rounds) state.finished = true;
}

export function shanghaiResults(state: ShanghaiState): PlayerResult[] {
  return [{ score: state.score, legsWon: 0, setsWon: 0, winner: false }];
}
