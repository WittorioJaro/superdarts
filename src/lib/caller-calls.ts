import { dartScore, isPossibleVisitTotal } from "./darts/board";
import { isCheckoutPossible, type OutMode } from "./darts/checkout";
import type { ConfigMap, ModeId, StateMap } from "./darts/modes";

/** Clip ids after the latest dart, in order; silence while the visit is open. */
export function callsFor<M extends ModeId>(mode: M, state: StateMap[M], config: ConfigMap[M]): string[] {
  if (state.open !== null) return [];
  const turn = state.turns.at(-1);
  if (!turn) return [];
  const ev = state.event;
  if (ev?.type === "match") return ["game-shot-match"];
  if (ev?.type === "set") return ["game-shot-set", "game-on"];
  if (ev?.type === "leg") return ["game-shot-leg", "game-on"];

  if (mode === "x01") {
    const s = state as StateMap["x01"];
    const c = config as ConfigMap["x01"];
    if (!turn.bust && !isPossibleVisitTotal(turn.points)) return [];
    return [turn.bust ? "bust" : `score-${turn.points}`, ...requireCalls(s.remaining[s.current], c.out)];
  }

  if (mode === "checkout" || mode === "onetwentyone") {
    const s = state as StateMap["checkout"] | StateMap["onetwentyone"];
    if (!turn.checkout && !turn.bust && !isPossibleVisitTotal(turn.points)) return [];
    const calls = [turn.checkout ? "game-shot-leg" : turn.bust ? "bust" : `score-${turn.points}`];
    // Whether the attempt carries on or the next target is up, the player hears what they need now.
    if (!s.finished) calls.push(...requireCalls(s.remaining));
    return calls;
  }

  const sum = turn.darts.reduce((n, d) => n + dartScore(d), 0);
  return isPossibleVisitTotal(sum) ? [`score-${sum}`] : [];
}

function requireCalls(left: number, out: OutMode = "double"): string[] {
  return left >= 2 && left <= 170 && isCheckoutPossible(left, 3, out) ? [`require-${left}`] : [];
}

/** Every existing clip, for warming the cache before the first visit. */
export function allCalls(): string[] {
  const ids = ["game-on", "bust", "game-shot-leg", "game-shot-set", "game-shot-match"];
  for (let n = 0; n <= 180; n++) if (isPossibleVisitTotal(n)) ids.push(`score-${n}`);
  for (let n = 2; n <= 170; n++) ids.push(`require-${n}`);
  return ids;
}
