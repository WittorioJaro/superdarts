import { type Dart, dartScore } from "./board";

/** A dart after the game has interpreted it. */
export interface ScoredDart extends Dart {
  score: number;
  /** What the player was aiming at, when the mode defines one (a number, or a double for `atDouble`). */
  target: number | null;
  hit: boolean | null;
  /** The dart was thrown at a double: a checkout attempt or a doubles drill. */
  atDouble: boolean;
  /** Useful cricket marks: closing marks plus points scored against an open number. */
  marks?: number;
}

/** One visit to the oche: up to three darts by one player. */
export interface Turn {
  player: number;
  set: number;
  /** Leg number across the whole game, starting at 0. */
  leg: number;
  /** This player's visit number within the leg, starting at 0. */
  visit: number;
  darts: ScoredDart[];
  points: number;
  /** Score left before the visit, for modes that count down. */
  startScore: number | null;
  bust: boolean;
  checkout: boolean;
}

export interface BaseState {
  players: number;
  turns: Turn[];
  /** Index into `turns` of the visit still being thrown, or null between visits. */
  open: number | null;
  current: number;
  finished: boolean;
  winner: number | null;
  /** Something worth announcing that happened on the last dart. */
  event: GameEvent | null;
}

export type GameEvent =
  | { type: "leg"; player: number }
  | { type: "set"; player: number }
  | { type: "match"; player: number }
  | { type: "bust"; player: number }
  | { type: "max"; player: number }
  | { type: "hit"; player: number }
  | { type: "out"; player: number };

export interface PlayerResult {
  /** The mode's headline number for this player (darts used, points, hit count...). */
  score: number;
  legsWon: number;
  setsWon: number;
  winner: boolean;
}

export function newBaseState(players: number): BaseState {
  return { players, turns: [], open: null, current: 0, finished: false, winner: null, event: null };
}

export function openTurn(
  state: BaseState,
  init: Partial<Omit<Turn, "player" | "darts" | "points" | "bust" | "checkout">> = {},
): Turn {
  if (state.open !== null) return state.turns[state.open];
  const player = state.current;
  const leg = init.leg ?? 0;
  const visit =
    init.visit ?? state.turns.filter((t) => t.player === player && t.leg === leg).length;
  const turn: Turn = {
    player,
    set: init.set ?? 0,
    leg,
    visit,
    darts: [],
    points: 0,
    startScore: init.startScore ?? null,
    bust: false,
    checkout: false,
  };
  state.turns.push(turn);
  state.open = state.turns.length - 1;
  return turn;
}

export function scored(d: Dart, extra: Partial<Omit<ScoredDart, "s" | "m" | "score">> = {}): ScoredDart {
  return { ...d, score: dartScore(d), target: null, hit: null, atDouble: false, ...extra };
}

export function closeTurn(state: BaseState, advance = true) {
  state.open = null;
  if (advance) state.current = (state.current + 1) % state.players;
}

export function currentTurn(state: BaseState): Turn | null {
  return state.open === null ? null : state.turns[state.open];
}

export function dartsThrown(state: BaseState, player: number): number {
  return state.turns.reduce((n, t) => (t.player === player ? n + turnDarts(t) : n), 0);
}

/** Three-dart average from visits, counting bust darts with no score. */
export function threeDartAverage(turns: Turn[], player?: number): number {
  let points = 0;
  let darts = 0;
  for (const t of turns) {
    if (player !== undefined && t.player !== player) continue;
    darts += turnDarts(t);
    points += t.bust ? 0 : t.points;
  }
  return darts === 0 ? 0 : (points / darts) * 3;
}

/** Aggregate entries represent their declared number of physical darts. */
export function turnDarts(turn: Turn): number {
  return turn.darts.reduce((n, d) => n + (d.v?.darts ?? 1), 0);
}

export function turnAtDouble(turn: Turn): number {
  return turn.darts.reduce((n, d) => n + (d.v?.atDouble ?? Number(d.atDouble)), 0);
}
