import { describe, expect, it } from "vitest";
import { type Dart, MISS, visitTotal, isPossibleVisitTotal } from "./board";
import { botDart, levelModel, mulberry32 } from "./bot";
import { threeDartAverage } from "./engine";
import { replay, results } from "./modes";
import { CRICKET_NUMBERS } from "./modes/cricket";
import { liveRemaining, x01Apply, x01Init, visitTotalNeeds } from "./modes/x01";
import { buildRecords } from "./records";
import { configSchemas, saveGameSchema } from "./schemas";
import { DEFAULT_RATING, updateRating } from "../ratings/glicko2";
const T = (s: number): Dart => ({ s, m: 3 });
const D = (s: number): Dart => ({ s, m: 2 });
const S = (s: number): Dart => ({ s, m: 1 });
const x = { startScore: 501, out: "double" as const, legs: 1, sets: 1 };
const c = { variant: "standard" as const, legs: 1 };
const o = { start: 121, attempts: 5, darts: 9 as const, onFail: "stay" as const };

describe("cricket", () => {
  it("closes marks and scores excess marks only against open opponents", () => {
    const s = replay("cricket", c, 2, [T(20), T(20), S(1), T(20), T(20), MISS, T(20)]);
    expect(s.marks.map((m) => m[0])).toEqual([3, 3]);
    expect(s.points).toEqual([60, 0]);
    expect(s.turns[0].points).toBe(60);
    expect(s.turns[0].darts[0]).toMatchObject({ target: 20, hit: true });
  });
  it("cut-throat gives points to every unclosed opponent", () => {
    const s = replay("cricket", { ...c, variant: "cutthroat" }, 3, [T(19), T(19)]);
    expect(s.points).toEqual([0, 57, 57]);
    expect(s.turns[0].points).toBe(114);
  });
  it("requires a points lead, wins legs and rotates the starter", () => {
    const darts = [T(20), T(19), T(18), MISS, MISS, MISS, T(17), T(16), T(15), MISS, MISS, MISS, D(25), S(25)];
    const s = replay("cricket", { ...c, legs: 2 }, 2, darts);
    expect(s.legsWon).toEqual([1, 0]);
    expect(s.current).toBe(1);
    expect(s.marks[0]).toEqual(Array(7).fill(0));
    expect(replay("cricket", c, 2, darts).winner).toBe(0);
  });
  it("solo closes all seven and scores darts used", () => {
    const s = replay("cricket", c, 1, [...CRICKET_NUMBERS.slice(0, 6).map(T), D(25), S(25)]);
    expect(s.finished).toBe(true);
    expect(results("cricket", s, c)[0].score).toBe(8);
  });
});

describe("121", () => {
  it("advances on success and stays or resets on failure", () => {
    const win = [T(20), S(11), D(25)];
    expect(replay("onetwentyone", o, 1, win).target).toBe(122);
    expect(replay("onetwentyone", o, 1, [...win, ...Array(9).fill(MISS)]).target).toBe(122);
    const s = replay("onetwentyone", { ...o, onFail: "reset" }, 1, [...win, ...Array(9).fill(MISS)]);
    expect(s.target).toBe(121);
    expect(s.results).toEqual([{ target: 121, success: true, darts: 3 }, { target: 122, success: false, darts: 9 }]);
  });
  it("bust restores the visit start and continues the attempt", () => {
    const s = replay("onetwentyone", o, 1, [T(20), T(19), S(4)]);
    expect(s.remaining).toBe(121);
    expect(s.results).toEqual([]);
    expect(s.turns[0].bust).toBe(true);
    expect(replay("onetwentyone", { ...o, darts: 3 }, 1, Array(15).fill(MISS)).finished).toBe(true);
  });
});

describe("target", () => {
  it("matches exact rings and closes a partial final visit", () => {
    const config = { targets: [T(20), D(25)] as { s: number; m: 1 | 2 | 3 }[], dartsPerTarget: 4 };
    const s = replay("target", config, 1, [T(20), S(20), MISS, T(20), D(25), S(25), D(25), MISS]);
    expect(s.hits).toEqual([2, 2]);
    expect(s.finished).toBe(true);
    expect(s.turns.map((t) => t.darts.length)).toEqual([3, 1, 3, 1]);
    expect(s.turns[2].darts[0].atDouble).toBe(true);
    expect(configSchemas.target.safeParse({ ...config, targets: [T(25)] }).success).toBe(false);
  });
});

describe("visit totals", () => {
  it("validates totals, applies normal visits and busts", () => {
    expect(isPossibleVisitTotal(179)).toBe(false);
    expect(() => visitTotal(60, { darts: 1 })).not.toThrow();
    expect(() => visitTotal(70, { darts: 1 })).toThrow();
    expect(replay("x01", x, 1, [visitTotal(100)]).remaining).toEqual([401]);
    expect(replay("x01", { ...x, startScore: 100 }, 1, [visitTotal(120)]).turns[0].bust).toBe(true);
  });
  it("checks finish legality against darts used", () => {
    expect(replay("x01", { ...x, startScore: 120 }, 1, [visitTotal(120, { darts: 2 })]).finished).toBe(false);
    const s = replay("x01", { ...x, startScore: 100 }, 1, [visitTotal(100, { darts: 2, atDouble: 1 })]);
    expect(s.finished).toBe(true);
    expect(threeDartAverage(s.turns)).toBe(150);
    expect(visitTotalNeeds(x01Init({ ...x, startScore: 100 }, 1), x, 100)).toEqual({ darts: true, atDouble: true });
    expect(visitTotalNeeds(x01Init({ ...x, startScore: 100 }, 1), x, 60)).toEqual({ darts: false, atDouble: false });
    expect(visitTotalNeeds(x01Init({ ...x, startScore: 100 }, 1), x, 0)).toEqual({ darts: false, atDouble: false });
  });
  it("records physical dart counts, unknown attempts and real timestamps without fabricated landings", () => {
    const r = buildRecords("x01", x, ["p"], [{ ...T(20), t: 1000 }, S(20), S(20), visitTotal(100, { atDouble: 1 })]);
    expect(r.players[0].dartsThrown).toBe(6);
    expect(r.turns[1].atDouble).toBe(1);
    expect(r.darts).toHaveLength(3);
    expect(r.darts[0].thrownAt).toEqual(new Date(1000));
    expect(saveGameSchema.safeParse({ id: crypto.randomUUID(), kind: "practice", mode: "target", config: {},
      playerIds: [crypto.randomUUID()], darts: [visitTotal(60)], startedAt: new Date().toISOString() }).success).toBe(false);
  });
});

it("builds meaningful records for new modes", () => {
  expect(buildRecords("cricket", c, ["p"], [T(20)]).players[0]).toMatchObject({ score: 1, average: null });
  expect(buildRecords("onetwentyone", o, ["p"], [T(20), S(11), D(25)]).players[0].score).toBe(121);
  expect(buildRecords("target", { targets: [{ s: 20, m: 3 }], dartsPerTarget: 3 }, ["p"], [T(20), S(20), T(20)]).players[0].score).toBe(2);
});

it("Glicko-2 matches the paper's worked example", () => {
  const r = updateRating({ rating: 1500, rd: 200, vol: 0.06 }, [
    { rating: 1400, rd: 30, score: 1 }, { rating: 1550, rd: 100, score: 0 }, { rating: 1700, rd: 300, score: 0 }]);
  expect(Math.abs(r.rating - 1464.06)).toBeLessThan(0.02);
  expect(r.rd).toBeCloseTo(151.52, 2);
  expect(Math.abs(r.vol - 0.05999)).toBeLessThan(0.00001);
  expect(updateRating(DEFAULT_RATING, []).rd).toBeGreaterThan(350);
});

for (const average of [40, 60, 80]) it(`calibrates Bot ${average} over 1500 complete 501 legs`, () => {
  const rng = mulberry32(12345);
  const model = levelModel(average);
  let points = 0;
  let darts = 0;
  for (let leg = 0; leg < 1500; leg++) {
    const s = x01Init(x, 1);
    for (let i = 0; !s.finished && i < 1000; i++) {
      const dartsLeft = (3 - (s.open === null ? 0 : s.turns[s.open].darts.length)) as 1 | 2 | 3;
      x01Apply(s, botDart(model, { remaining: liveRemaining(s, 0), dartsLeft, out: "double" }, rng), x);
    }
    expect(s.finished).toBe(true);
    points += 501;
    darts += s.turns.reduce((n, t) => n + t.darts.length, 0);
  }
  expect(Math.abs(points / darts * 3 - average), `actual ${points / darts * 3}`).toBeLessThan(4);
});

it("cricket requires the best points as well as closed numbers", async () => {
  const { cricketInit, cricketApply } = await import("./modes/cricket");
  for (const variant of ["standard", "cutthroat"] as const) {
    const config = { ...c, variant };
    const s = cricketInit(config, 2);
    s.marks[0].fill(3);
    s.points = variant === "standard" ? [0, 20] : [20, 0];
    cricketApply(s, MISS, config);
    expect(s.finished).toBe(false);
    s.points = [20, 20];
    cricketApply(s, MISS, config);
    expect(s.winner).toBe(0);
  }
});

it("cricket MPR ignores darts at numbers closed by everyone", async () => {
  const { cricketMpr } = await import("./modes/cricket");
  const s = replay("cricket", c, 2, [T(20), T(20), MISS, T(20), T(20), T(20)]);
  expect(s.turns[1].darts.map((d) => d.marks)).toEqual([3, 0, 0]);
  expect(cricketMpr(s.turns)).toBe(4.5);
});

it("121 bust restores the start of this visit, preserving previous visits", () => {
  const s = replay("onetwentyone", o, 1, [T(20), S(20), S(1), T(20), D(20)]);
  expect(s.results).toEqual([{ target: 121, success: true, darts: 5 }]);
  expect(s.turns.map((t) => t.startScore)).toEqual([121, 40, 40]);
  expect(s.turns[1].bust).toBe(true);
});

it("outer bull target excludes bullseyes", () => {
  const s = replay("target", { targets: [{ s: 25, m: 1 }], dartsPerTarget: 3 }, 1, [S(25), D(25), S(25)]);
  expect(s.hits).toEqual([2]);
  expect(s.turns[0].darts.every((d) => !d.atDouble)).toBe(true);
});

it("preserves old pending saves without timestamps, aggregates or ranked", () => {
  expect(saveGameSchema.safeParse({ id: crypto.randomUUID(), kind: "practice", mode: "scoring", config: { rounds: 10 },
    playerIds: [crypto.randomUUID()], darts: [T(20)], startedAt: new Date().toISOString() }).success).toBe(true);
});

it("whole visits respect straight and master out, and cannot replace a partial visit", () => {
  expect(replay("x01", { ...x, startScore: 60, out: "master" }, 1, [visitTotal(60, { darts: 1 })]).finished).toBe(true);
  expect(replay("x01", { ...x, startScore: 60, out: "double" }, 1, [visitTotal(60, { darts: 1 })]).finished).toBe(false);
  expect(replay("x01", { ...x, startScore: 20, out: "single" }, 1, [visitTotal(20, { darts: 1 })]).finished).toBe(true);
  expect(replay("x01", x, 1, [S(20), visitTotal(60)]).turns[0].darts).toHaveLength(1);
});

it("averages darts over won 501 legs only", async () => {
  const { scoringStats } = await import("./stats");
  const stats = scoringStats([
    { points: 501, darts: 15, bust: false, checkout: true, startScore: 501, visit: 0, legKey: "a" },
    { points: 501, darts: 21, bust: false, checkout: true, startScore: 501, visit: 0, legKey: "b" },
    { points: 301, darts: 12, bust: false, checkout: true, startScore: 301, visit: 0, legKey: "c" },
    { points: 400, darts: 18, bust: false, checkout: false, startScore: 501, visit: 0, legKey: "d" },
  ], 9);
  expect(stats.bestLeg).toBe(15);
  expect(stats.dartsPerLeg).toBe(18);
  expect(stats.checkoutPct).toBeCloseTo(100 / 3);
});
