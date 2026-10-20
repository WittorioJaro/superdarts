import { BOARD_ORDER, type Dart } from "./board";
import { suggestCheckout, type OutMode } from "./checkout";

export type BotProfile = { kind: "level"; average: number } | { kind: "ghost"; of: string; from: string; to: string };
export interface BotModel { trebleRate: number; singleRate: number; doubleRate: number; bullRate: number; label: string }

export function mulberry32(seed: number): () => number {
  return () => {
    let n = seed += 0x6D2B79F5;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

/** Rates calibrated against completed solo 501 legs, including misses and busts. */
export function levelModel(average: number): BotModel {
  const a = Math.max(20, Math.min(120, average - Math.max(0, 90 - average) * 0.15));
  const skill = (a - 20) / 100;
  return { trebleRate: Math.max(0.01, (a - 32) / 145), singleRate: 0.5 + skill * 0.45,
    doubleRate: 0.08 + skill * 0.65, bullRate: 0.04 + skill * 0.4, label: `Bot ${average}` };
}

export function botDart(model: BotModel, ctx: { remaining: number | null; dartsLeft: 1 | 2 | 3; out: OutMode }, rng: () => number): Dart {
  const route = ctx.remaining === null ? null : suggestCheckout(ctx.remaining, ctx.dartsLeft, ctx.out);
  let aim: Dart = route?.[0] ?? { s: 20, m: 3 };
  if (!route && ctx.remaining !== null && ctx.remaining <= 60) {
    // Leave a useful double when this visit cannot finish.
    aim = ctx.remaining > 40 ? { s: ctx.remaining - 40, m: 1 } : ctx.remaining % 2 ? { s: 1, m: 1 } : { s: ctx.remaining / 2, m: 2 };
    if (aim.s > 20) aim = { s: 20, m: 1 };
  }
  const rate = aim.s === 25 ? model.bullRate : aim.m === 3 ? model.trebleRate : aim.m === 2 ? model.doubleRate : model.singleRate;
  if (rng() < rate) return aim;
  if (aim.s === 25) return rng() < 0.7 ? { s: 25, m: 1 } : { s: BOARD_ORDER[Math.floor(rng() * 20)], m: 1 };
  const miss = rng();
  if (aim.m === 2 && miss < 0.45) return { s: 0, m: 0 };
  if (miss < 0.75 && aim.m !== 1) return { s: aim.s, m: 1 };
  const i = BOARD_ORDER.indexOf(aim.s);
  const s = BOARD_ORDER[(i + (rng() < 0.5 ? 19 : 1)) % 20];
  return { s, m: aim.m === 3 && rng() < 0.15 ? 3 : 1 };
}
