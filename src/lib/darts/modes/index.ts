import type { Dart } from "../board";
import type { BaseState, PlayerResult } from "../engine";
import * as P from "./practice";
import { type X01Config, type X01State, x01Apply, x01Init, x01Results } from "./x01";

export type ModeId = "x01" | "scoring" | "around" | "bobs27" | "doubles" | "checkout" | "shanghai";

export interface ConfigMap {
  x01: X01Config;
  scoring: P.ScoringConfig;
  around: P.AroundConfig;
  bobs27: P.BobsConfig;
  doubles: P.DoublesConfig;
  checkout: P.CheckoutConfig;
  shanghai: P.ShanghaiConfig;
}

export interface StateMap {
  x01: X01State;
  scoring: P.ScoringState;
  around: P.AroundState;
  bobs27: P.BobsState;
  doubles: P.DoublesState;
  checkout: P.CheckoutState;
  shanghai: P.ShanghaiState;
}

interface Engine<M extends ModeId> {
  init(config: ConfigMap[M], players: number): StateMap[M];
  apply(state: StateMap[M], dart: Dart, config: ConfigMap[M]): void;
  results(state: StateMap[M], config: ConfigMap[M]): PlayerResult[];
}

const ENGINES: { [M in ModeId]: Engine<M> } = {
  x01: { init: x01Init, apply: x01Apply, results: x01Results },
  scoring: { init: P.scoringInit, apply: P.scoringApply, results: P.scoringResults },
  around: { init: P.aroundInit, apply: P.aroundApply, results: P.aroundResults },
  bobs27: { init: P.bobsInit, apply: (s, d) => P.bobsApply(s, d), results: P.bobsResults },
  doubles: { init: P.doublesInit, apply: P.doublesApply, results: P.doublesResults },
  checkout: { init: P.checkoutInit, apply: P.checkoutApply, results: P.checkoutResults },
  shanghai: { init: P.shanghaiInit, apply: P.shanghaiApply, results: P.shanghaiResults },
};

/** Rebuild a game's state from its full dart history. Undo is just replaying one dart fewer. */
export function replay<M extends ModeId>(mode: M, config: ConfigMap[M], players: number, darts: Dart[]): StateMap[M] {
  const engine = ENGINES[mode] as Engine<M>;
  const state = engine.init(config, players);
  for (const d of darts) {
    if ((state as BaseState).finished) break;
    engine.apply(state, d, config);
  }
  return state;
}

export function results<M extends ModeId>(mode: M, state: StateMap[M], config: ConfigMap[M]): PlayerResult[] {
  return (ENGINES[mode] as Engine<M>).results(state, config);
}

export interface ModeInfo {
  name: string;
  blurb: string;
  /** What the headline score means, and which direction is better. */
  scoreLabel: string;
  better: "higher" | "lower";
  /** Visits feed the scoring averages. */
  scoring: boolean;
}

export const MODES: Record<ModeId, ModeInfo> = {
  x01: {
    name: "X01",
    blurb: "Count down to zero.",
    scoreLabel: "Legs won",
    better: "higher",
    scoring: true,
  },
  scoring: {
    name: "Free throw",
    blurb: "Throw at anything. Every visit counts towards your average.",
    scoreLabel: "Points",
    better: "higher",
    scoring: true,
  },
  around: {
    name: "Around the clock",
    blurb: "Hit 1 through 20, then the bull, in order.",
    scoreLabel: "Darts used",
    better: "lower",
    scoring: false,
  },
  bobs27: {
    name: "Bob's 27",
    blurb: "Start on 27. Three darts at each double. Miss them all and you lose its value.",
    scoreLabel: "Score",
    better: "higher",
    scoring: false,
  },
  doubles: {
    name: "Doubles",
    blurb: "Three darts at every double and the bull.",
    scoreLabel: "Doubles hit",
    better: "higher",
    scoring: false,
  },
  checkout: {
    name: "Checkouts",
    blurb: "Random finishes. Take each one out on a double.",
    scoreLabel: "Finishes",
    better: "higher",
    scoring: false,
  },
  shanghai: {
    name: "Shanghai",
    blurb: "One number per round. Single, double and treble in a visit is a Shanghai.",
    scoreLabel: "Points",
    better: "higher",
    scoring: false,
  },
};

export type AnyConfig = ConfigMap[ModeId];
export type AnyState = StateMap[ModeId];
