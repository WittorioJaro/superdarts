import { expect, it } from "vitest";
import { applyBias, createBias, learnCorrection, nearestPointInBed, restoreBias } from "./bias";
import { scoreAt } from "./score";
import { BOARD_ORDER } from "../darts/board";
it("projects onto each corrected bed, including both single regions", () => {
  for (const s of [0, 25, ...BOARD_ORDER]) for (const m of s === 0 ? [0] as const : s === 25 ? [1, 2] as const : [1, 2, 3] as const) {
    const dart = { s, m };
    for (const p of [{ x: 0, y: -0.61 }, { x: 0, y: 0 }, { x: 1.5, y: 0.2 }]) expect(scoreAt(nearestPointInBed(p, dart))).toEqual(dart);
  }
  expect(nearestPointInBed({ x: 0, y: -0.8 }, { s: 20, m: 1 })).toEqual({ x: 0, y: -0.8 });
});
it("learns bounded directional correction without mutating state and persists", () => {
  const original = createBias();
  let state = original;
  for (let i = 0; i < 100; i++) state = learnCorrection(state, { x: 0, y: -0.57 }, { s: 20, m: 3 });
  expect(state.offset.y).toBeLessThan(0); expect(Math.abs(state.offset.y)).toBeLessThan(0.03);
  expect(original.offset).toEqual({ x: 0, y: 0 });
  const before = state.offset;
  state = learnCorrection(state, { x: 0, y: -0.57 }, { s: 3, m: 2 });
  expect(Math.hypot(state.offset.x - before.x, state.offset.y - before.y)).toBeLessThanOrEqual(0.01501);
  expect(applyBias(state, { x: 0, y: 0 }, 0.02).sigma).toBeGreaterThan(0.02);
  expect(restoreBias(JSON.parse(JSON.stringify(state)))).toEqual(state);
  expect(restoreBias({ ...state, offset: { x: 10, y: 0 } })).toBeNull();
});
