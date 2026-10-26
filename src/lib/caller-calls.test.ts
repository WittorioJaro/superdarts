import { describe, expect, it } from "vitest";
import { allCalls, callsFor } from "./caller-calls";
import { type Dart, MISS, visitTotal } from "./darts/board";
import { type ConfigMap, type ModeId, replay } from "./darts/modes";
import type { X01Config } from "./darts/modes/x01";

const T = (s: number): Dart => ({ s, m: 3 });
const D = (s: number): Dart => ({ s, m: 2 });
const S = (s: number): Dart => ({ s, m: 1 });

function calls<M extends ModeId>(mode: M, config: ConfigMap[M], darts: Dart[], players = 1) {
  return callsFor(mode, replay(mode, config, players, darts), config);
}

function x01(darts: Dart[], config: Partial<X01Config> = {}, players = 2) {
  return calls("x01", { startScore: 501, out: "double", legs: 1, sets: 1, ...config }, darts, players);
}

describe("x01 calls", () => {
  it("waits for a closed visit, including after a previous visit", () => {
    expect(x01([])).toEqual([]);
    expect(x01([T(20)])).toEqual([]);
    expect(x01([T(20), T(20)])).toEqual([]);
    expect(x01([T(20), T(20), T(20), S(20)])).toEqual([]);
  });

  it("calls totals from darts and whole visits, including no score", () => {
    expect(x01([T(20), T(20), T(20)])).toEqual(["score-180"]);
    expect(x01([S(20), S(5), S(1)])).toEqual(["score-26"]);
    expect(x01([visitTotal(0)])).toEqual(["score-0"]);
    expect(x01([visitTotal(180)])).toEqual(["score-180"]);
  });

  it("announces the next player's finish using the configured out rule", () => {
    expect(x01([visitTotal(60)], { startScore: 101 }, 1)).toEqual(["score-60", "require-41"]);
    expect(x01([visitTotal(60)], { startScore: 101 }, 2)).toEqual(["score-60", "require-101"]);
    expect(x01([visitTotal(1)], { startScore: 160 }, 1)).toEqual(["score-1"]);
    expect(x01([visitTotal(1)], { startScore: 160, out: "single" }, 1)).toEqual(["score-1", "require-159"]);
    expect(x01([visitTotal(1)], { startScore: 160, out: "master" }, 1)).toEqual(["score-1", "require-159"]);
    expect(x01([visitTotal(0)], { startScore: 170 }, 1)).toEqual(["score-0", "require-170"]);
    expect(x01([visitTotal(0)], { startScore: 171, out: "single" }, 1)).toEqual(["score-0"]);
    expect(x01([visitTotal(1)], { startScore: 2, out: "single" }, 1)).toEqual(["score-1"]);
  });

  it("calls early busts and the restored score", () => {
    expect(x01([T(20)], { startScore: 40 }, 1)).toEqual(["bust", "require-40"]);
    expect(x01([S(20), S(19)], { startScore: 40 }, 1)).toEqual(["bust", "require-40"]);
    expect(x01([S(20), S(20)], { startScore: 40 }, 1)).toEqual(["bust", "require-40"]);
  });

  it("prioritizes leg, set and match events over score and require calls", () => {
    expect(x01([D(20)], { startScore: 40, legs: 2 }, 1)).toEqual(["game-shot-leg", "game-on"]);
    expect(x01([D(20)], { startScore: 40, sets: 2 }, 1)).toEqual(["game-shot-set", "game-on"]);
    expect(x01([D(20)], { startScore: 40 }, 1)).toEqual(["game-shot-match"]);
    expect(x01([visitTotal(40, { darts: 1 })], { startScore: 40 }, 1)).toEqual(["game-shot-match"]);
  });
});

describe("checkout practice calls", () => {
  const config: ConfigMap["checkout"] = { min: 2, max: 170, darts: 6, targets: [100, 32] };

  it("waits for the visit and announces the remaining finish", () => {
    expect(calls("checkout", config, [])).toEqual([]);
    expect(calls("checkout", config, [S(20)])).toEqual([]);
    expect(calls("checkout", config, [S(20), S(20), S(20)])).toEqual(["score-60", "require-40"]);
  });

  it("calls an early finish and the next target, but no game-on", () => {
    const darts = [T(20), D(20)];
    const state = replay("checkout", config, 1, darts);
    expect(state.open).toBeNull();
    expect(state.turns.at(-1)?.darts).toHaveLength(2);
    expect(callsFor("checkout", state, config)).toEqual(["game-shot-leg", "require-32"]);
    expect(calls("checkout", config, [...darts, D(16)])).toEqual(["game-shot-leg"]);
  });

  it("ends the attempt on a bust and announces the next target", () => {
    for (const darts of [[T(20), T(20)], [T(20), S(20), S(20)], [T(20), T(13)]]) {
      const state = replay("checkout", config, 1, darts);
      expect(state.open).toBeNull();
      expect(state.attempt).toBe(1);
      expect(state.remaining).toBe(32);
      expect(callsFor("checkout", state, config)).toEqual(["bust", "require-32"]);
    }
    expect(calls("checkout", { ...config, targets: [40] }, [T(20)])).toEqual(["bust"]);
  });

  it("announces the next target after exhausting the dart budget", () => {
    expect(calls("checkout", { ...config, darts: 3 }, [S(20), S(20), S(20)])).toEqual(["score-60", "require-32"]);
    expect(calls("checkout", { ...config, darts: 3, targets: [100] }, [S(20), S(20), S(20)])).toEqual(["score-60"]);
  });

  it("omits bogey numbers from require calls", () => {
    expect(calls("checkout", { ...config, targets: [170] }, [S(11), MISS, MISS])).toEqual(["score-11"]);
  });
});

describe("121 calls", () => {
  const config: ConfigMap["onetwentyone"] = { start: 121, attempts: 3, darts: 9, onFail: "stay" };

  it("waits for a visit and announces its total and remaining finish", () => {
    expect(calls("onetwentyone", config, [])).toEqual([]);
    expect(calls("onetwentyone", config, [S(20)])).toEqual([]);
    expect(calls("onetwentyone", config, [S(20), S(20), S(20)])).toEqual(["score-60", "require-61"]);
  });

  it("calls a checkout and the incremented target", () => {
    const darts = [T(20), T(11), D(14)];
    expect(calls("onetwentyone", config, darts)).toEqual(["game-shot-leg", "require-122"]);
    expect(calls("onetwentyone", { ...config, attempts: 1 }, darts)).toEqual(["game-shot-leg"]);
    const early = { ...config, start: 40 };
    const state = replay("onetwentyone", early, 1, [D(20)]);
    expect(state.open).toBeNull();
    expect(state.turns.at(-1)?.darts).toHaveLength(1);
    expect(callsFor("onetwentyone", state, early)).toEqual(["game-shot-leg", "require-41"]);
  });

  it("restores the visit's start score on a bust within the same attempt", () => {
    const c = { ...config, start: 100 };
    const state = replay("onetwentyone", c, 1, [S(20), S(20), S(20), S(20), T(20)]);
    expect(state.open).toBeNull();
    expect(state.attempt).toBe(0);
    expect(state.remaining).toBe(40);
    expect(state.used).toBe(6);
    expect(callsFor("onetwentyone", state, c)).toEqual(["bust", "require-40"]);
  });

  it("announces the next attempt after a bust uses up the last visit, unless the game is over", () => {
    const c = { ...config, start: 40, darts: 3 as const };
    const state = replay("onetwentyone", c, 1, [T(20)]);
    expect(state.attempt).toBe(1);
    expect(state.remaining).toBe(40);
    expect(callsFor("onetwentyone", state, c)).toEqual(["bust", "require-40"]);
    expect(calls("onetwentyone", { ...c, attempts: 1 }, [T(20)])).toEqual(["bust"]);
  });

  it("uses the stayed or reset target after an unsuccessful attempt", () => {
    const darts = [T(20), T(11), D(14), MISS, MISS, MISS];
    expect(calls("onetwentyone", { ...config, darts: 3 }, darts)).toEqual(["score-0", "require-122"]);
    expect(calls("onetwentyone", { ...config, darts: 3, onFail: "reset" }, darts)).toEqual(["score-0", "require-121"]);
    expect(calls("onetwentyone", { ...config, darts: 3, attempts: 1 }, [MISS, MISS, MISS])).toEqual(["score-0"]);
  });

  it("only announces next targets with existing, possible finishes", () => {
    expect(calls("onetwentyone", { ...config, start: 158 }, [T(20), T(20), D(19)])).toEqual(["game-shot-leg"]);
    expect(calls("onetwentyone", { ...config, start: 170 }, [T(20), T(20), D(25)])).toEqual(["game-shot-leg"]);
  });
});

type VisitCase = { [M in ModeId]: { mode: M; config: ConfigMap[M]; darts: Dart[]; total: number } }[ModeId];
const visits: VisitCase[] = [
  { mode: "scoring", config: { rounds: 1 }, darts: [T(20), T(20), T(20)], total: 180 },
  { mode: "around", config: { ring: "any" }, darts: [S(1), T(20), D(3)], total: 67 },
  { mode: "bobs27", config: {}, darts: [S(20), T(20), MISS], total: 80 },
  { mode: "doubles", config: { order: "sequence", targets: [1] }, darts: [D(1), T(20), S(20)], total: 82 },
  { mode: "shanghai", config: { rounds: 7 }, darts: [S(1), D(1), T(1)], total: 6 },
  { mode: "cricket", config: { variant: "standard", legs: 1 }, darts: [T(20), T(19), T(18)], total: 171 },
  { mode: "target", config: { targets: [{ s: 20, m: 3 }], dartsPerTarget: 3 }, darts: [T(20), S(1), D(25)], total: 111 },
];

describe.each(visits)("$mode visit calls", ({ mode, config, darts, total }) => {
  it("waits until the visit closes", () => {
    for (let n = 0; n < 3; n++) expect(calls(mode, config, darts.slice(0, n))).toEqual([]);
  });

  it("confirms clicked dart values regardless of the mode's points or hit events", () => {
    const state = replay(mode, config, 1, darts);
    expect(state.open).toBeNull();
    expect(state.turns.at(-1)?.darts).toHaveLength(3);
    expect(callsFor(mode, state, config)).toEqual([`score-${total}`]);
  });
});

describe("early finishes outside countdown modes", () => {
  it("calls the last around-the-clock visit's face values, even on checkout", () => {
    const darts = [MISS, ...Array.from({ length: 20 }, (_, i) => S(i + 1)), S(25)];
    const config: ConfigMap["around"] = { ring: "any" };
    const state = replay("around", config, 1, darts);
    expect(state.finished).toBe(true);
    expect(state.open).toBeNull();
    expect(state.turns.at(-1)?.checkout).toBe(true);
    expect(state.turns.at(-1)?.darts).toHaveLength(1);
    expect(callsFor("around", state, config)).toEqual(["score-25"]);
  });

  it("calls a target visit closed before three darts", () => {
    const config: ConfigMap["target"] = { targets: [{ s: 20, m: 3 }], dartsPerTarget: 1 };
    const state = replay("target", config, 1, [D(25)]);
    expect(state.finished).toBe(true);
    expect(state.open).toBeNull();
    expect(callsFor("target", state, config)).toEqual(["score-50"]);
  });

  it("calls no score when Bob's 27 ends with a negative points visit", () => {
    expect(calls("bobs27", {}, Array(15).fill(MISS))).toEqual(["score-0"]);
  });
});

describe("cricket events", () => {
  const leg = [T(20), T(19), T(18), T(17), T(16), T(15), D(25), S(25)];

  it.each(["standard", "cutthroat"] as const)("calls %s legs and matches before visit totals", (variant) => {
    const config: ConfigMap["cricket"] = { variant, legs: 2 };
    const state = replay("cricket", config, 1, leg);
    expect(state.open).toBeNull();
    expect(state.turns.at(-1)?.darts).toHaveLength(2);
    expect(callsFor("cricket", state, config)).toEqual(["game-shot-leg", "game-on"]);
    expect(calls("cricket", config, [...leg, ...leg])).toEqual(["game-shot-match"]);
  });
});

describe("existing clips", () => {
  it("warms every existing clip exactly once", () => {
    const ids = allCalls();
    const impossible = [163, 166, 169, 172, 173, 175, 176, 178, 179];
    const scores = Array.from({ length: 181 }, (_, n) => n).filter((n) => !impossible.includes(n)).map((n) => `score-${n}`);
    const requires = Array.from({ length: 169 }, (_, i) => `require-${i + 2}`);
    expect(ids).toEqual(["game-on", "bust", "game-shot-leg", "game-shot-set", "game-shot-match", ...scores, ...requires]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("guards impossible face-value totals", () => {
    expect(calls("scoring", { rounds: 1 }, [S(179), MISS, MISS])).toEqual([]);
  });
});
