import { RINGS } from "../board-geometry";
import { BOARD_ORDER, type Dart, type Multiplier } from "../darts/board";
import type { BoardPoint } from "./homography";
export type { BoardPoint } from "./homography";
export interface Candidate { dart: Dart; p: number }
export interface Covariance { xx: number; xy: number; yy: number }

function scoreKey(x: number, y: number): number {
  const r = Math.hypot(x, y);
  if (r > RINGS.doubleOut) return 0;
  if (r <= RINGS.bull) return 25 * 4 + 2;
  if (r <= RINGS.outerBull) return 25 * 4 + 1;
  const angle = (Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2);
  const s = BOARD_ORDER[Math.floor((angle + Math.PI / 20) / (Math.PI / 10)) % 20];
  const m = r >= RINGS.doubleIn ? 2 : r >= RINGS.trebleIn && r <= RINGS.trebleOut ? 3 : 1;
  return s * 4 + m;
}
function dartOf(key: number): Dart { return { s: Math.floor(key / 4), m: (key % 4) as Multiplier }; }

/** Wires have zero area: radial ties go to bull / treble / double; angular ties go clockwise. */
export function scoreAt(p: BoardPoint): Dart {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error("Non-finite board point");
  return dartOf(scoreKey(p.x, p.y));
}

const quadratures = new Map<number, { z: number[]; w: number[] }>();
function quadrature(n: number) {
  let q = quadratures.get(n);
  if (!q) {
    const z = Array.from({ length: n }, (_, i) => -4 + (i + 0.5) * 8 / n);
    const w = z.map((v) => Math.exp(-v * v / 2));
    const total = w.reduce((s, v) => s + v, 0);
    q = { z, w: w.map((v) => v / total) }; quadratures.set(n, q);
  }
  return q;
}

/** Numeric sigma is a standard deviation in board units; covariance entries are squared board units. */
export function scoreDistribution(p: BoardPoint, sigma: number | Covariance, opts: { samples?: number } = {}): Candidate[] {
  scoreAt(p);
  const n = opts.samples ?? 16;
  if (!Number.isInteger(n) || n < 4 || n > 64) throw new Error("Use 4–64 quadrature samples per axis");
  let a: number, b: number, c: number;
  if (typeof sigma === "number") {
    if (!Number.isFinite(sigma) || sigma < 0) throw new Error("Invalid sigma");
    a = c = sigma; b = 0;
  } else {
    const { xx, xy, yy } = sigma;
    if (![xx, xy, yy].every(Number.isFinite) || xx < 0 || yy < 0 || xy * xy > xx * yy + 1e-15 || (xx === 0 && xy !== 0)) throw new Error("Invalid covariance");
    a = Math.sqrt(xx); b = a ? xy / a : 0; c = Math.sqrt(Math.max(0, yy - b * b));
  }
  const q = quadrature(n), weights = new Float64Array(103);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    weights[scoreKey(p.x + a * q.z[i], p.y + b * q.z[i] + c * q.z[j])] += q.w[i] * q.w[j];
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const result: Candidate[] = [];
  for (let key = 0; key < weights.length; key++) if (weights[key] > 0) result.push({ dart: dartOf(key), p: weights[key] / total });
  return result.sort((a, b) => b.p - a.p || a.dart.s - b.dart.s || a.dart.m - b.dart.m);
}

export function neighbours(dart: Dart): Dart[] {
  if (dart.s === 0) return [{ s: 20, m: 2 }, { s: 1, m: 2 }, { s: 5, m: 2 }, { s: 20, m: 1 }, { s: 25, m: 1 }];
  if (dart.s === 25) return [{ s: 25, m: dart.m === 2 ? 1 : 2 }, ...[20, 1, 5, 3].map((s) => ({ s, m: 1 as const }))];
  const i = BOARD_ORDER.indexOf(dart.s);
  if (i < 0 || ![1, 2, 3].includes(dart.m)) return neighbours({ s: 0, m: 0 });
  return [...([1, 3, 2] as const).filter((m) => m !== dart.m).map((m) => ({ s: dart.s, m })),
    { s: BOARD_ORDER[(i + 19) % 20], m: dart.m }, { s: BOARD_ORDER[(i + 1) % 20], m: dart.m },
    ...(dart.m === 2 ? [{ s: 0, m: 0 as const }] : [{ s: 25, m: 1 as const }])];
}

/** Keeps measured probabilities; neighbour padding has p=0. k must be between 1 and the 63 legal scores. */
export function topSuggestions(dist: readonly Candidate[], k = 6): Candidate[] {
  if (!Number.isInteger(k) || k < 1 || k > 63) throw new Error("Use 1–63 suggestions");
  const result: Candidate[] = [], seen = new Set<number>();
  const add = (c: Candidate) => {
    const key = c.dart.s * 4 + c.dart.m;
    if (!seen.has(key)) { seen.add(key); result.push(c); }
  };
  for (const c of [...dist].sort((a, b) => b.p - a.p)) add(c);
  if (!result.length) add({ dart: { s: 20, m: 1 }, p: 0 });
  for (let i = 0; result.length < k && i < result.length; i++) for (const dart of neighbours(result[i].dart)) add({ dart, p: 0 });
  return result.slice(0, k);
}
