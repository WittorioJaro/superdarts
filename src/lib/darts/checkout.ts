import { type Dart, dartScore } from "./board";

export type OutMode = "double" | "single" | "master";

/** Doubles in the order players usually prefer to finish on. */
const DOUBLE_PREFERENCE = [20, 16, 8, 18, 12, 10, 4, 2, 14, 6, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1, 25];

function finishingDarts(out: OutMode): Dart[] {
  const doubles: Dart[] = DOUBLE_PREFERENCE.map((s) => ({ s, m: 2 }));
  if (out === "double") return doubles;
  const trebles: Dart[] = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((s) => ({ s, m: 3 }));
  if (out === "master") return [...doubles, ...trebles];
  const singles: Dart[] = Array.from({ length: 20 }, (_, i) => ({ s: 20 - i, m: 1 as const }));
  return [...trebles, ...doubles, ...singles, { s: 25, m: 1 }];
}

/**
 * Setup darts ranked by how natural they are: big trebles first, then singles,
 * then the bull. Rank doubles as the penalty for a route that uses them.
 */
const SETUP_DARTS: Dart[] = (() => {
  const trebles = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((s) => ({ s, m: 3 as const }));
  const singles = Array.from({ length: 20 }, (_, i) => ({ s: 20 - i, m: 1 as const }));
  const doubles = Array.from({ length: 20 }, (_, i) => ({ s: 20 - i, m: 2 as const }));
  return [...trebles, { s: 25, m: 1 as const }, { s: 25, m: 2 as const }, ...singles, ...doubles];
})();

function setupCost(d: Dart): number {
  // Singles are the easiest to hit, so a single that leaves a good double beats a treble.
  if (d.m === 1 && d.s !== 25) return 0;
  if (d.m === 3) return 1 + (20 - d.s) * 0.05;
  if (d.s === 25) return 3;
  return 4;
}

type Route = { darts: Dart[]; cost: number };
const memo = new Map<string, Route | null>();

function bestRoute(remaining: number, dartsLeft: number, out: OutMode): Route | null {
  const key = `${remaining}:${dartsLeft}:${out}`;
  if (memo.has(key)) return memo.get(key)!;

  let best: Route | null = null;
  const finishers = finishingDarts(out);
  const finishIdx = finishers.findIndex((d) => dartScore(d) === remaining);
  if (finishIdx >= 0) best = { darts: [finishers[finishIdx]], cost: finishIdx * 0.1 };

  if (!best && dartsLeft > 1) {
    for (const setup of SETUP_DARTS) {
      const rest = remaining - dartScore(setup);
      if (rest < 2 && !(out === "single" && rest === 1)) continue;
      const tail = bestRoute(rest, dartsLeft - 1, out);
      if (!tail) continue;
      // Fewer darts always wins; cost breaks ties between routes of equal length.
      const cost = tail.darts.length * 100 + tail.cost + setupCost(setup);
      if (!best || cost < best.cost) best = { darts: [setup, ...tail.darts], cost };
    }
  }

  memo.set(key, best);
  return best;
}

/** Suggested finishing route, or null if the score can't be checked out with the darts left. */
export function suggestCheckout(remaining: number, dartsLeft: number, out: OutMode = "double"): Dart[] | null {
  if (remaining < 1 || remaining > 180 || dartsLeft < 1) return null;
  return bestRoute(remaining, Math.min(dartsLeft, 3), out)?.darts ?? null;
}

export function isCheckoutPossible(remaining: number, dartsLeft = 3, out: OutMode = "double"): boolean {
  return suggestCheckout(remaining, dartsLeft, out) !== null;
}
