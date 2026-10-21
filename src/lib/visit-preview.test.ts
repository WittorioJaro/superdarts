import { describe, expect, it } from "vitest";
import type { Dart } from "./darts/board";
import type { ActiveGame } from "./game-store";
import { previewVisit } from "./visit-preview";

const T20: Dart = { s: 20, m: 3 };
const game = (darts: Dart[], startScore = 501): ActiveGame => ({
  id: "g", kind: "match", mode: "x01", startedAt: "", darts,
  config: { startScore, out: "double", legs: 1, sets: 1 } as never,
  players: [{ id: "a", name: "A", color: "#fff" }, { id: "b", name: "B", color: "#000" }],
});

describe("previewVisit", () => {
  it("applies a full visit and reports what's left", () => {
    const p = previewVisit(game([]), [T20, T20, T20]);
    expect(p.applied).toBe(3);
    expect(p.turn!.startScore! - p.turn!.points).toBe(321);
  });

  it("stops at a bust, so later darts never count for the next player", () => {
    const p = previewVisit(game([], 101), [T20, T20, { s: 1, m: 1 }]);
    expect(p.applied).toBe(2);
    expect(p.turn?.bust).toBe(true);
  });

  it("stops at a checkout", () => {
    const p = previewVisit(game([], 40), [{ s: 20, m: 2 }, T20]);
    expect(p.applied).toBe(1);
    expect(p.turn?.checkout).toBe(true);
  });

  it("continues a visit already in progress", () => {
    const p = previewVisit(game([T20]), [T20, T20, T20]);
    expect(p.applied).toBe(2);
  });
});
