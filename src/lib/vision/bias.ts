import { RINGS } from "../board-geometry";
import { BOARD_ORDER, isValidDart, type Dart } from "../darts/board";
import type { BoardPoint } from "./homography";

export interface BiasState { version: 1; offset: BoardPoint; sigma: number; samples: number }
export const BIAS_DEFAULTS = { alpha: 0.15, maxStep: 0.1, maxOffset: 0.15, minSigma: 0.005, maxSigma: 0.15 };
export function createBias(): BiasState { return { version: 1, offset: { x: 0, y: 0 }, sigma: 0.02, samples: 0 }; }
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function bounded(p: BoardPoint, max: number): BoardPoint {
  const scale = Math.min(1, max / (Math.hypot(p.x, p.y) || 1));
  return { x: p.x * scale, y: p.y * scale };
}

/** Euclidean projection into the corrected bed's interior; single beds include both single annuli. */
export function nearestPointInBed(p: BoardPoint, dart: Dart): BoardPoint {
  if (!isValidDart(dart) || dart.v || !Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new Error("Invalid point or scoring dart");
  const eps = 1e-7, r = Math.hypot(p.x, p.y), angle = Math.atan2(p.x, -p.y);
  if (dart.s === 0 || dart.s === 25) {
    const lo = dart.s === 0 ? 1 + eps : dart.m === 2 ? 0 : RINGS.bull + eps;
    const hi = dart.s === 0 ? Infinity : dart.m === 2 ? RINGS.bull - eps : RINGS.outerBull - eps;
    const radius = clamp(r, lo, hi);
    return { x: Math.sin(angle) * radius, y: -Math.cos(angle) * radius };
  }
  const center = BOARD_ORDER.indexOf(dart.s) * Math.PI / 10;
  const delta = Math.atan2(Math.sin(angle - center), Math.cos(angle - center));
  const a = center + clamp(delta, -Math.PI / 20 + eps, Math.PI / 20 - eps);
  const projection = p.x * Math.sin(a) - p.y * Math.cos(a);
  const bands = dart.m === 3 ? [[RINGS.trebleIn, RINGS.trebleOut]] : dart.m === 2 ? [[RINGS.doubleIn, 1]]
    : [[RINGS.outerBull, RINGS.trebleIn], [RINGS.trebleOut, RINGS.doubleIn]];
  return bands.map(([lo, hi]) => {
    const radius = clamp(projection, lo + eps, hi - eps);
    return { x: Math.sin(a) * radius, y: -Math.cos(a) * radius };
  }).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
}

/** predicted is the RAW detector point: do not pass the already bias-adjusted prediction. Returns a new state. */
export function learnCorrection(state: BiasState, predicted: BoardPoint, corrected: Dart, opts: Partial<typeof BIAS_DEFAULTS> = {}): BiasState {
  const o = { ...BIAS_DEFAULTS, ...opts };
  if (!(o.alpha > 0 && o.alpha <= 1 && o.maxStep > 0 && o.maxOffset > 0 && o.minSigma > 0 && o.maxSigma >= o.minSigma)) throw new Error("Invalid bias parameters");
  const adjusted = applyBias(state, predicted).board;
  const target = nearestPointInBed(adjusted, corrected);
  const error = bounded({ x: target.x - adjusted.x, y: target.y - adjusted.y }, o.maxStep);
  const offset = bounded({ x: state.offset.x + o.alpha * error.x, y: state.offset.y + o.alpha * error.y }, o.maxOffset);
  const residual = Math.hypot(error.x, error.y) / Math.SQRT2;
  return { version: 1, offset, sigma: clamp(Math.sqrt((1 - o.alpha) * state.sigma ** 2 + o.alpha * residual ** 2), o.minSigma, o.maxSigma), samples: state.samples + 1 };
}

export function applyBias(state: BiasState, p: BoardPoint, sigma = 0): { board: BoardPoint; sigma: number } {
  return { board: { x: p.x + state.offset.x, y: p.y + state.offset.y }, sigma: Math.hypot(sigma, state.sigma) };
}
export function restoreBias(value: unknown): BiasState | null {
  const s = value as BiasState;
  if (s?.version !== 1 || !s.offset || ![s.offset.x, s.offset.y, s.sigma, s.samples].every(Number.isFinite)
    || Math.hypot(s.offset.x, s.offset.y) > BIAS_DEFAULTS.maxOffset + 1e-12 || s.sigma < BIAS_DEFAULTS.minSigma || s.sigma > BIAS_DEFAULTS.maxSigma || !Number.isSafeInteger(s.samples) || s.samples < 0) return null;
  return { version: 1, offset: { ...s.offset }, sigma: s.sigma, samples: s.samples };
}
