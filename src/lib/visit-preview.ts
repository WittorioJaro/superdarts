import type { Dart } from "./darts/board";
import type { Turn } from "./darts/engine";
import { type AnyState, replay } from "./darts/modes";
import type { ActiveGame } from "./game-store";

export interface VisitPreview {
  /** How many of the darts land in the current visit. The rest would spill into the next player's turn. */
  applied: number;
  turn: Turn | null;
  state: AnyState;
}

/**
 * What the game would look like with these darts added, stopping where the visit ends
 * (third dart, bust, checkout or a finished game), so a confirm can never throw for the next player.
 */
export function previewVisit(game: ActiveGame, darts: Dart[]): VisitPreview {
  const all = [...game.darts];
  let state = replay(game.mode, game.config as never, game.players.length, all);
  let visit: number | null = null;
  let applied = 0;
  for (const d of darts) {
    if (state.finished || (visit !== null && state.open !== visit)) break;
    all.push(d);
    state = replay(game.mode, game.config as never, game.players.length, all);
    visit ??= state.open ?? state.turns.length - 1;
    applied++;
  }
  return { applied, turn: visit === null ? null : (state.turns[visit] ?? null), state };
}
