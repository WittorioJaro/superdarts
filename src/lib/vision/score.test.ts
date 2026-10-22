import { describe, expect, it } from "vitest";
import { RINGS } from "../board-geometry";
import { BOARD_ORDER } from "../darts/board";
import { neighbours, scoreAt, scoreDistribution, topSuggestions } from "./score";
const polar = (r: number, degrees = 0) => ({ x: r * Math.sin(degrees * Math.PI / 180), y: -r * Math.cos(degrees * Math.PI / 180) });
describe("exact scoring", () => {
  it("scores every number in both singles, treble and double", () => {
    BOARD_ORDER.forEach((s, i) => {
      for (const [r, m] of [[0.3, 1], [0.8, 1], [(RINGS.trebleIn + RINGS.trebleOut) / 2, 3], [(RINGS.doubleIn + 1) / 2, 2]]) {
        expect(scoreAt(polar(r, i * 18))).toEqual({ s, m });
      }
    });
    expect(scoreAt({ x: 0, y: 0 })).toEqual({ s: 25, m: 2 });
    expect(scoreAt(polar(0.06))).toEqual({ s: 25, m: 1 });
    expect(scoreAt(polar(1.01))).toEqual({ s: 0, m: 0 });
  });
  it("specifies radial ties and both sides of every wire", () => {
    for (const [r, inside, outside] of [[RINGS.bull, { s: 25, m: 2 }, { s: 25, m: 1 }],
      [RINGS.outerBull, { s: 25, m: 1 }, { s: 20, m: 1 }], [RINGS.trebleIn, { s: 20, m: 1 }, { s: 20, m: 3 }],
      [RINGS.trebleOut, { s: 20, m: 3 }, { s: 20, m: 1 }], [RINGS.doubleIn, { s: 20, m: 1 }, { s: 20, m: 2 }], [1, { s: 20, m: 2 }, { s: 0, m: 0 }]] as const) {
      expect(scoreAt(polar(r - 1e-8))).toEqual(inside); expect(scoreAt(polar(r + 1e-8))).toEqual(outside);
    }
    expect(scoreAt(polar(RINGS.trebleIn))).toEqual({ s: 20, m: 3 });
    expect(scoreAt(polar(1))).toEqual({ s: 20, m: 2 });
    BOARD_ORDER.forEach((s, i) => {
      expect(scoreAt(polar(0.8, i * 18 + 9 - 1e-6))).toEqual({ s, m: 1 });
      expect(scoreAt(polar(0.8, i * 18 + 9 + 1e-6))).toEqual({ s: BOARD_ORDER[(i + 1) % 20], m: 1 });
    });
  });
});
describe("probabilistic scoring", () => {
  it("splits a treble/single boundary approximately equally", () => {
    const dist = scoreDistribution(polar(RINGS.trebleIn), 0.003);
    expect(dist.find((c) => c.dart.m === 3)?.p).toBeCloseTo(0.5, 1);
    expect(dist.find((c) => c.dart.m === 1)?.p).toBeCloseTo(0.5, 1);
  });
  it("normalizes deterministic isotropic, correlated and singular Gaussians", () => {
    for (const sigma of [0, 0.01, 0.3, { xx: 0.001, xy: 0.0004, yy: 0.002 }, { xx: 0, xy: 0, yy: 0.01 }]) {
      const d = scoreDistribution(polar(0.61, -9), sigma);
      expect(d.reduce((s, c) => s + c.p, 0)).toBeCloseTo(1, 12);
      expect(d).toEqual(scoreDistribution(polar(0.61, -9), sigma));
      expect(d.every((c, i) => !i || c.p <= d[i - 1].p)).toBe(true);
    }
    expect(() => scoreDistribution(polar(0.5), { xx: 1, xy: 2, yy: 1 })).toThrow();
    expect(() => scoreDistribution(polar(0.5), -1)).toThrow();
  });
  it("pads concentrated suggestions with distinct adjacent beds", () => {
    const d = scoreDistribution(polar(0.8), 0);
    const top = topSuggestions(d, 6);
    expect(top).toHaveLength(6); expect(top[0]).toEqual({ dart: { s: 20, m: 1 }, p: 1 });
    expect(top.slice(1, 5).map((c) => c.dart)).toEqual([{ s: 20, m: 3 }, { s: 20, m: 2 }, { s: 5, m: 1 }, { s: 1, m: 1 }]);
    expect(new Set(topSuggestions(d, 63).map((c) => `${c.dart.s}:${c.dart.m}`)).size).toBe(63);
    expect(topSuggestions([], 6)).toHaveLength(6);
    expect(neighbours({ s: 25, m: 2 })[0]).toEqual({ s: 25, m: 1 });
    expect(neighbours({ s: 0, m: 0 })[0].m).toBe(2);
  });
});
