import type { Dart } from "./board";
import { replay, type ConfigMap, type ModeId } from "./modes";

/** Turn order comes from replay, including busts, visit totals and rotating legs. */
export function turnOf<M extends ModeId>(mode: M, config: ConfigMap[M], nPlayers: number, darts: Dart[]): number | null {
  const state = replay(mode, config, nPlayers, darts);
  return state.finished ? null : state.current;
}

export function isGameFinished<M extends ModeId>(mode: M, config: ConfigMap[M], nPlayers: number, darts: Dart[]): boolean {
  return replay(mode, config, nPlayers, darts).finished;
}

export function rotate<T>(players: readonly T[]): T[] {
  return players.length ? [...players.slice(1), players[0]] : [];
}
