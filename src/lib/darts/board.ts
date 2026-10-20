/**
 * A single dart as entered on the pad.
 * `s` is the segment (1-20, 25 for the bull, 0 for a miss) and `m` the ring
 * multiplier (0 miss, 1 single, 2 double, 3 treble). The bullseye is `{ s: 25, m: 2 }`.
 */
export type Multiplier = 0 | 1 | 2 | 3;

export interface Dart {
  s: number;
  m: Multiplier;
  t?: number;
  v?: { total: number; darts: 1 | 2 | 3; atDouble: number };
}

export const MISS: Dart = { s: 0, m: 0 };
export const OUTER_BULL: Dart = { s: 25, m: 1 };
export const BULLSEYE: Dart = { s: 25, m: 2 };

export function dartScore(d: Dart): number {
  return d.m === 0 ? 0 : d.s * d.m;
}

export function isValidDart(d: Dart): boolean {
  if (d.v) return d.s === 0 && d.m === 0 && isPossibleVisitTotal(d.v.total) && [1, 2, 3].includes(d.v.darts)
    && Number.isInteger(d.v.atDouble) && d.v.atDouble >= 0 && d.v.atDouble <= d.v.darts && isPossibleTotalWith(d.v.total, d.v.darts);
  if (d.m === 0) return d.s === 0;
  if (d.s === 25) return d.m === 1 || d.m === 2;
  return Number.isInteger(d.s) && d.s >= 1 && d.s <= 20 && d.m >= 1 && d.m <= 3;
}

export function sameDart(a: Dart, b: Dart): boolean {
  if (a.v || b.v) return !!a.v && !!b.v && a.v.total === b.v.total && a.v.darts === b.v.darts && a.v.atDouble === b.v.atDouble;
  return a.s === b.s && a.m === b.m;
}

export function dartLabel(d: Dart): string {
  if (d.v) return String(d.v.total);
  if (d.m === 0) return "Miss";
  if (d.s === 25) return d.m === 2 ? "Bull" : "25";
  if (d.m === 3) return `T${d.s}`;
  if (d.m === 2) return `D${d.s}`;
  return String(d.s);
}

/** Label for a double target, where 25 means the bullseye. */
export function doubleLabel(target: number): string {
  return target === 25 ? "Bull" : `D${target}`;
}

/** Clockwise order of the numbers on a board, starting from 20 at the top. */
export const BOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

export function isVisitTotal(d: Dart): boolean { return d.v !== undefined; }

export function isPossibleVisitTotal(total: number): boolean {
  return Number.isInteger(total) && total >= 0 && total <= 180 && ![179, 178, 176, 175, 173, 172, 169, 166, 163].includes(total);
}

const possibleTotals = [new Set([0])];
/** Reachable score with up to n darts, allowing misses. Cached for replay and schema validation. */
export function isPossibleTotalWith(total: number, n: number): boolean {
  if (!Number.isInteger(n) || n < 0 || n > 3) return false;
  const values = [0, 25, 50, ...Array.from({ length: 20 }, (_, i) => [i + 1, (i + 1) * 2, (i + 1) * 3]).flat()];
  while (possibleTotals.length <= n) possibleTotals.push(new Set([...possibleTotals.at(-1)!].flatMap((s) => values.map((v) => s + v))));
  return possibleTotals[n].has(total);
}

export function visitTotal(total: number, opts: { darts?: 1 | 2 | 3; atDouble?: number } = {}): Dart {
  const d: Dart = { s: 0, m: 0, v: { total, darts: opts.darts ?? 3, atDouble: opts.atDouble ?? 0 } };
  if (!isValidDart(d)) throw new Error("Impossible visit total");
  return d;
}
