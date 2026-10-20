/**
 * A single dart as entered on the pad.
 * `s` is the segment (1-20, 25 for the bull, 0 for a miss) and `m` the ring
 * multiplier (0 miss, 1 single, 2 double, 3 treble). The bullseye is `{ s: 25, m: 2 }`.
 */
export type Multiplier = 0 | 1 | 2 | 3;

export interface Dart {
  s: number;
  m: Multiplier;
}

export const MISS: Dart = { s: 0, m: 0 };
export const OUTER_BULL: Dart = { s: 25, m: 1 };
export const BULLSEYE: Dart = { s: 25, m: 2 };

export function dartScore(d: Dart): number {
  return d.m === 0 ? 0 : d.s * d.m;
}

export function isValidDart(d: Dart): boolean {
  if (d.m === 0) return d.s === 0;
  if (d.s === 25) return d.m === 1 || d.m === 2;
  return Number.isInteger(d.s) && d.s >= 1 && d.s <= 20 && d.m >= 1 && d.m <= 3;
}

export function sameDart(a: Dart, b: Dart): boolean {
  return a.s === b.s && a.m === b.m;
}

export function dartLabel(d: Dart): string {
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
