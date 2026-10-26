import { describe, expect, it } from "vitest";
import { type Dart, visitTotal } from "./darts/board";
import { allCalls, visitCalls } from "./caller";
import { replay } from "./darts/modes";
import type { X01Config, X01State } from "./darts/modes/x01";

const T = (s: number): Dart => ({ s, m: 3 });
const D = (s: number): Dart => ({ s, m: 2 });
const S = (s: number): Dart => ({ s, m: 1 });

function calls(darts: Dart[], config: Partial<X01Config> = {}, players = 2) {
  const c: X01Config = { startScore: 501, out: "double", legs: 1, sets: 1, ...config };
  const state = replay("x01", c, players, darts) as X01State;
  return visitCalls(state, c);
}

describe("caller", () => {
  it("says nothing until the visit is over", () => {
    expect(calls([T(20)])).toEqual([]);
    expect(calls([T(20), T(20)])).toEqual([]);
  });

  it("calls the visit total", () => {
    expect(calls([T(20), T(20), T(20)])).toEqual(["score-180"]);
    expect(calls([S(20), S(5), S(1)])).toEqual(["score-26"]);
    expect(calls([visitTotal(0)])).toEqual(["score-0"]);
  });

  it("tells the next player what they require when they're on a finish", () => {
    expect(calls([visitTotal(60)], { startScore: 101 }, 1)).toEqual(["score-60", "require-41"]);
    // 159 is no finish with a double out, so it isn't called.
    expect(calls([visitTotal(1)], { startScore: 160 }, 1)).toEqual(["score-1"]);
    expect(calls([visitTotal(1)], { startScore: 160, out: "single" }, 1)).toEqual(["score-1", "require-159"]);
  });

  it("calls a bust", () => {
    expect(calls([T(20)], { startScore: 40 }, 1)).toEqual(["bust", "require-40"]);
  });

  it("calls game shot", () => {
    expect(calls([D(20)], { startScore: 40, legs: 2 }, 1)).toEqual(["game-shot-leg", "game-on"]);
    expect(calls([D(20)], { startScore: 40 }, 1)).toEqual(["game-shot-match"]);
  });

  it("only warms clips that exist", () => {
    const ids = allCalls();
    expect(ids).not.toContain("score-179");
    expect(ids).toContain("score-180");
    expect(new Set(ids).size).toBe(ids.length);
  });
});
