import { beforeEach, describe, expect, it, vi } from "vitest";
import { fatigue, ghostModel, practiceTargets, targetSpread } from "./queries";
import { levelModel } from "./darts/bot";

const mock = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(mock.execute) };
});

beforeEach(() => { mock.execute.mockReset(); });

describe("grouped target history", () => {
  const rows = [
    [20, 3, true, 20, 3, 12], [20, 1, false, 20, 3, 4], [5, 1, false, 20, 3, 3],
    [1, 1, false, 20, 3, 2], [0, 0, false, 20, 3, 1],
    [20, 2, true, 20, 2, 5], [20, 1, false, 20, 2, 6], [0, 0, false, null, 3, 8],
  ];

  it("weights landings by dart count and keeps repeated targets in different rings separate", async () => {
    mock.execute.mockResolvedValue({ rows });
    expect(await targetSpread("player", { s: 20, m: 3 }, "all")).toEqual({
      total: 22, hits: 12, left: 3, right: 2, ring: 4, other: 1,
      landings: [{ s: 0, m: 0, n: 1 }, { s: 1, m: 1, n: 2 }, { s: 5, m: 1, n: 3 },
        { s: 20, m: 1, n: 4 }, { s: 20, m: 3, n: 12 }],
    });
    expect(await practiceTargets("player")).toEqual([
      { s: 20, m: 3, total: 22, hits: 12 }, { s: 20, m: 2, total: 11, hits: 5 },
    ]);
    expect(mock.execute.mock.calls[0][0]).toContain("group by");
  });

  it("returns empty history without invented darts", async () => {
    mock.execute.mockResolvedValue({ rows: [] });
    expect(await practiceTargets("player")).toEqual([]);
    expect((await targetSpread("player", { s: 25, m: 2 }, "30d")).total).toBe(0);
  });
});

describe("ghost aggregates", () => {
  it("preserves scoring and finishing rates, including unknown double targets", async () => {
    mock.execute.mockImplementation(async (query: string) => ({ rows: query.includes('from "darts"')
      ? [[120, 90, 18, 72, 20, 8, 10, 3]] : [[1800, 90]] }));
    expect(await ghostModel("player", "2026-01-01", "2026-02-01")).toEqual({
      trebleRate: 0.2, singleRate: 0.8, doubleRate: 0.4, bullRate: 0.3, label: "Ghost",
    });
    const query = mock.execute.mock.calls.find(([sql]) => sql.includes('from "darts"'))![0];
    expect(query).toContain('"darts"."target" is distinct from 25');
  });

  it("retains the estimated model and per-target sample thresholds", async () => {
    mock.execute.mockImplementation(async (query: string) => ({ rows: query.includes('from "darts"')
      ? [[89, 89, 20, 70, 0, 0, 0, 0]] : [[1800, 90]] }));
    expect(await ghostModel("player", "2026-01-01", "2026-02-01"))
      .toEqual({ ...levelModel(60), label: "Ghost (estimated)" });
    mock.execute.mockImplementation(async (query: string) => ({ rows: query.includes('from "darts"')
      ? [[100, 100, 20, 70, 8, 5, 8, 5]] : [[1800, 90]] }));
    expect(await ghostModel("player", "2026-01-01", "2026-02-01"))
      .toMatchObject({ doubleRate: levelModel(60).doubleRate, bullRate: levelModel(60).bullRate });
  });
});

it("serializes sparse fatigue buckets in time order with a finite final bound", async () => {
  mock.execute.mockResolvedValue({ rows: [[6, 60, 3], [0, 120, 6], [2, 0, 2]] });
  expect(await fatigue("player")).toEqual([
    { fromMinute: 0, toMinute: 5, average: 60, darts: 6 },
    { fromMinute: 10, toMinute: 15, average: 0, darts: 2 },
    { fromMinute: 45, toMinute: Number.MAX_SAFE_INTEGER, average: 60, darts: 3 },
  ]);
  const query = mock.execute.mock.calls[0][0];
  expect(query).toContain('with "session_starts" as');
  expect(query).toContain('min("thrown_at")');
  expect(query).toContain('case when "turns"."bust" then 0');
});
