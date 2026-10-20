import type { Dart } from "../board";
import { type BaseState, type PlayerResult, closeTurn, newBaseState, openTurn, scored } from "../engine";

export interface TargetConfig { targets: { s: number; m: 1 | 2 | 3 }[]; dartsPerTarget: number }
export interface TargetState extends BaseState { index: number; thrown: number; hits: number[] }
export const TARGET_DEFAULTS: TargetConfig = { targets: [{ s: 20, m: 3 }], dartsPerTarget: 30 };
export function targetInit(config: TargetConfig, players: number): TargetState {
  return { ...newBaseState(players), index: 0, thrown: 0, hits: config.targets.map(() => 0) };
}
export function targetApply(state: TargetState, dart: Dart, config: TargetConfig) {
  if (state.finished || dart.v) return;
  state.event = null;
  const aim = config.targets[state.index];
  const hit = dart.s === aim.s && dart.m === aim.m;
  const turn = openTurn(state, { leg: state.index });
  turn.darts.push(scored(dart, { target: aim.s, hit, atDouble: aim.m === 2 }));
  state.thrown++;
  if (hit) { state.hits[state.index]++; turn.points++; state.event = { type: "hit", player: 0 }; }
  if (state.thrown >= config.dartsPerTarget) {
    closeTurn(state, false);
    state.index++;
    state.thrown = 0;
    if (state.index >= config.targets.length) state.finished = true;
  } else if (turn.darts.length === 3) closeTurn(state, false);
}
export function targetResults(state: TargetState): PlayerResult[] {
  return [{ score: state.hits.reduce((n, h) => n + h, 0), legsWon: 0, setsWon: 0, winner: false }];
}
