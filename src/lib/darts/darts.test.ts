import { describe, expect, it } from "vitest";
import { type Dart, dartLabel } from "./board";
import { suggestCheckout } from "./checkout";
import { threeDartAverage } from "./engine";
import { replay } from "./modes";
import { liveRemaining } from "./modes/x01";

const T = (s: number): Dart => ({ s, m: 3 });
const D = (s: number): Dart => ({ s, m: 2 });
const S = (s: number): Dart => ({ s, m: 1 });
const MISS: Dart = { s: 0, m: 0 };
const route = (r: number, n = 3) => suggestCheckout(r, n)?.map(dartLabel).join(" ") ?? null;

describe("checkout suggestions", () => {
  it("finds the standard big finishes", () => {
    expect(route(170)).toBe("T20 T20 Bull");
    expect(route(100)).toBe("T20 D20");
    expect(route(40)).toBe("D20");
    expect(route(60)).toBe("20 D20");
    expect(route(50)).toBe("Bull");
  });

  it("returns nothing for bogey numbers or when darts run out", () => {
    for (const bogey of [169, 168, 166, 165, 163, 162, 159]) expect(route(bogey)).toBeNull();
    expect(route(170, 2)).toBeNull();
    expect(route(1)).toBeNull();
  });

  it("finds a route for every finish from 2 to 158", () => {
    for (let r = 2; r <= 158; r++) expect(route(r), String(r)).not.toBeNull();
  });
});

describe("x01", () => {
  const config = { startScore: 101, out: "double" as const, legs: 2, sets: 1 };

  it("alternates players after three darts", () => {
    const s = replay("x01", config, 2, [S(20), S(20), S(20)]);
    expect(s.current).toBe(1);
    expect(s.remaining).toEqual([41, 101]);
  });

  it("busts below zero, on one, and on a non-double finish", () => {
    for (const darts of [[T(20), T(20)], [T(20), D(20)], [T(20), T(7), S(20)]]) {
      const s = replay("x01", config, 2, darts);
      expect(s.turns[0].bust).toBe(true);
      expect(s.remaining[0]).toBe(101);
      expect(s.current).toBe(1);
    }
    const single = replay("x01", { ...config, startScore: 40 }, 2, [S(20), S(20)]);
    expect(single.turns[0].bust).toBe(true);
  });

  it("wins legs on a double, rotates the throw, and ends the match", () => {
    const leg = [T(20), S(1), D(20)];
    let s = replay("x01", config, 2, leg);
    expect(s.totalLegsWon).toEqual([1, 0]);
    expect(s.current).toBe(1);
    expect(s.remaining).toEqual([101, 101]);

    s = replay("x01", config, 2, [...leg, ...leg]);
    expect(s.totalLegsWon).toEqual([1, 1]);
    expect(s.current).toBe(0);

    s = replay("x01", config, 2, [...leg, ...leg, ...leg]);
    expect(s.finished).toBe(true);
    expect(s.winner).toBe(0);
  });

  it("plays sets", () => {
    const leg = [T(20), S(1), D(20)];
    const s = replay("x01", { ...config, legs: 1, sets: 2 }, 2, [...leg, ...leg, ...leg]);
    expect(s.setsWon).toEqual([2, 1]);
    expect(s.finished).toBe(true);
  });

  it("marks darts at a double and the checkout hit", () => {
    const s = replay("x01", config, 2, [T(20), S(1), MISS, ...[MISS, MISS, MISS], D(20)]);
    const mine = s.turns.filter((t) => t.player === 0).flatMap((t) => t.darts);
    expect(mine.filter((d) => d.atDouble).map((d) => [d.target, d.hit])).toEqual([
      [20, false],
      [20, true],
    ]);
  });

  it("shows the live score mid-visit and averages per dart", () => {
    const s = replay("x01", { ...config, startScore: 501 }, 1, [T(20), T(20), T(20), S(20)]);
    expect(liveRemaining(s, 0)).toBe(501 - 180 - 20);
    expect(threeDartAverage(s.turns)).toBeCloseTo(150);
  });
});

describe("practice modes", () => {
  it("around the clock counts darts to finish", () => {
    const darts: Dart[] = [];
    for (let n = 1; n <= 20; n++) darts.push(MISS, S(n));
    darts.push({ s: 25, m: 1 });
    const s = replay("around", { ring: "any" }, 1, darts);
    expect(s.finished).toBe(true);
    expect(darts.length).toBe(41);
  });

  it("bob's 27 adds hits and subtracts misses", () => {
    let s = replay("bobs27", {}, 1, [D(1), MISS, D(1)]);
    expect(s.score).toBe(31);
    s = replay("bobs27", {}, 1, [D(1), MISS, D(1), MISS, MISS, MISS]);
    expect(s.score).toBe(27);
    const out = replay("bobs27", {}, 1, Array(3 * 5).fill(MISS));
    expect(out.finished).toBe(true);
    expect(out.score).toBeLessThanOrEqual(0);
  });

  it("checkout drill ends an attempt on a bust or a finish", () => {
    const s = replay("checkout", { min: 40, max: 40, darts: 3, targets: [40, 32] }, 1, [S(20), S(19), D(16)]);
    expect(s.results).toEqual([false, true]);
    expect(s.finished).toBe(true);
  });

  it("shanghai spots single, double and treble in one visit", () => {
    const s = replay("shanghai", { rounds: 7 }, 1, [S(1), D(1), T(1)]);
    expect(s.shanghais).toBe(1);
    expect(s.score).toBe(6);
  });
});
