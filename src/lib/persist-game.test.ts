import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { darts, games, players, ratingChanges, ratings } from "@/db/schema";
import { visitTotal } from "./darts/board";
import type { SaveGameInput } from "./darts/schemas";
import { DEFAULT_RATING, updateRating } from "./ratings/glicko2";
import { persistGame, type GameTransaction } from "./persist-game";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

const ids = [1, 2, 3, 4].map((n) => `00000000-0000-4000-8000-00000000000${n}`);
const input: SaveGameInput = {
  id: "00000000-0000-4000-8000-000000000010", kind: "match", ranked: true, mode: "x01",
  config: { startScore: 501, out: "double", legs: 1, sets: 1 }, playerIds: ids,
  darts: [180, 60, 60, 60, 180, 60, 60, 60].map((n) => visitTotal(n))
    .concat(visitTotal(141, { atDouble: 1 })), startedAt: "2026-10-21T12:00:00.000Z",
};

function connection(duplicate = false, knownIds = ids) {
  const writes: { table: unknown; rows: unknown }[] = [];
  const existing = [{ playerId: ids[1], rating: 1600, rd: 70, vol: 0.05, games: 12 }];
  const execute = vi.fn().mockResolvedValue([]);
  const tx = {
    execute,
    select: () => ({ from: (table: unknown) => ({ where: async () => table === players
      ? knownIds.map((id) => ({ id, bot: null })) : existing }) }),
    insert: (table: unknown) => ({ values: (rows: unknown) => {
      writes.push({ table, rows });
      return Object.assign(Promise.resolve([]), {
        onConflictDoNothing: () => ({ returning: async () => duplicate ? [] : [{ id: input.id }] }),
        onConflictDoUpdate: () => Promise.resolve([]),
      });
    } }),
    transaction: async (fn: (tx: unknown) => Promise<void>) => fn(tx),
  };
  return { tx: tx as unknown as GameTransaction, writes, execute, existing };
}

describe("ranked game persistence", () => {
  it("batches ratings while preserving a shared before-period and stable advisory locks", async () => {
    const { tx, writes, execute, existing } = connection();
    expect(await persistGame(input, ids[0], tx)).toEqual({ ok: true });
    expect(execute).toHaveBeenCalledTimes(4);
    const lockIds = execute.mock.calls.map(([query]) => new PgDialect().sqlToQuery(query).params[0]);
    expect(lockIds).toEqual([...ids].sort());
    const ratingWrites = writes.filter((w) => w.table === ratings);
    const historyWrites = writes.filter((w) => w.table === ratingChanges);
    expect(ratingWrites).toHaveLength(1);
    expect(historyWrites).toHaveLength(1);
    const before = ids.map((id) => existing.find((r) => r.playerId === id) ?? { ...DEFAULT_RATING, games: 0 });
    const expected = ids.map((playerId, i) => ({ playerId, ...updateRating(before[i], before.flatMap((r, j) =>
      i === j ? [] : [{ ...r, score: i === 0 ? 1 : j === 0 ? 0 : 0.5 }])), games: before[i].games + 1 }));
    expect(ratingWrites[0].rows).toEqual(expected.map((r) => ({ ...r, updatedAt: expect.any(Date) })));
    expect(historyWrites[0].rows).toEqual(expected.map((r, i) => ({ gameId: input.id, playerId: r.playerId,
      before: before[i].rating, after: r.rating, rdAfter: r.rd })));
  });

  it("leaves ratings and derived records alone on an idempotent retry", async () => {
    const { tx, writes, execute } = connection(true);
    expect(await persistGame(input, ids[0], tx)).toEqual({ ok: true });
    expect(writes.map((w) => w.table)).toEqual([games]);
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps legacy unranked saves working without rating writes", async () => {
    const { tx, writes, execute } = connection();
    expect(await persistGame({ ...input, ranked: undefined }, ids[0], tx)).toEqual({ ok: true });
    expect(writes.some((w) => w.table === ratings || w.table === ratingChanges)).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("still stores individual darts in bounded batches", async () => {
    const { tx, writes } = connection(false, [ids[0]]);
    const practice: SaveGameInput = { ...input, kind: "practice", ranked: false, mode: "scoring", config: { rounds: 0 },
      playerIds: [ids[0]], darts: Array.from({ length: 2501 }, () => ({ s: 20, m: 1 })) };
    expect(await persistGame(practice, ids[0], tx)).toEqual({ ok: true });
    const batches = writes.filter((w) => w.table === darts).map((w) => (w.rows as unknown[]).length);
    expect(batches).toEqual([1000, 1000, 501]);
  });
});
