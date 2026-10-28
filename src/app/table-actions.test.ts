import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies } from "next/headers";
import { db } from "@/db";
import { getCurrentPlayer } from "@/lib/auth";
import { persistGame } from "@/lib/persist-game";
import { getTableSession, TABLE_COOKIE, TABLE_TTL } from "@/lib/pub-tables";
import { revalidateGameData } from "@/lib/revalidate-data";
import { writeLive } from "@/lib/pub-table-live";
import { closeTable, pushTableLive, redeemTableCode, saveTableGame } from "./table-actions";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: { update: vi.fn() } }));
vi.mock("@/lib/auth", () => ({ getCurrentPlayer: vi.fn() }));
vi.mock("@/lib/persist-game", () => ({ persistGame: vi.fn() }));
vi.mock("@/lib/revalidate-data", () => ({ revalidateGameData: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/pub-table-live", async (original) => ({
  ...await original<typeof import("@/lib/pub-table-live")>(), writeLive: vi.fn(),
}));
vi.mock("@/lib/pub-tables", async (original) => ({
  ...await original<typeof import("@/lib/pub-tables")>(), getTableSession: vi.fn(),
}));

const hostId = "00000000-0000-4000-8000-000000000001";
const playerId = "00000000-0000-4000-8000-000000000002";
const input = { id: "00000000-0000-4000-8000-000000000010", kind: "match", mode: "x01",
  config: { startScore: 501, out: "double", legs: 1, sets: 1 }, playerIds: [playerId],
  darts: [{ s: 20, m: 3 }], startedAt: "2026-10-23T12:00:00.000Z" };
const store = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(cookies).mockResolvedValue(store as unknown as Awaited<ReturnType<typeof cookies>>);
  vi.mocked(getTableSession).mockResolvedValue({ id: input.id, hostId, hostName: "Host", playerIds: [playerId],
    players: [{ id: playerId, name: "Guest", color: "#abcdef" }], expiresAt: "2026-10-24T00:00:00.000Z" });
});

describe("pub table save permissions", () => {
  it("rejects a closed or expired session before attempting a save", async () => {
    vi.mocked(getTableSession).mockResolvedValue(null);
    expect(await saveTableGame(input)).toEqual({ ok: false, retry: false, error: "This table has been closed." });
    expect(persistGame).not.toHaveBeenCalled();
  });

  it("rejects malformed data, drills, practice and players outside the chosen list", async () => {
    for (const game of [null, { ...input, kind: "practice" }, { ...input, mode: "scoring" }, { ...input, playerIds: [hostId] }]) {
      expect(await saveTableGame(game)).toMatchObject({ ok: false, retry: false });
    }
    expect(persistGame).not.toHaveBeenCalled();
    expect(revalidateGameData).not.toHaveBeenCalled();
  });

  it("attributes allowed X01 and cricket matches to the host without a signed-in user", async () => {
    vi.mocked(persistGame).mockResolvedValue({ ok: true });
    for (const mode of ["x01", "cricket"]) {
      const game = { ...input, mode };
      expect(await saveTableGame(game)).toEqual({ ok: true });
      expect(persistGame).toHaveBeenLastCalledWith(game, hostId);
    }
    expect(getCurrentPlayer).not.toHaveBeenCalled();
    expect(revalidateGameData).toHaveBeenCalledTimes(2);
  });

  it("passes persistence failures through without revalidating", async () => {
    const failure = { ok: false as const, retry: false, error: "Only finished matches are saved." };
    vi.mocked(persistGame).mockResolvedValue(failure);
    expect(await saveTableGame(input)).toEqual(failure);
    expect(revalidateGameData).not.toHaveBeenCalled();
  });
});

describe("public table redemption and closure", () => {
  it("rejects malformed codes before querying or setting a cookie", async () => {
    for (const code of ["", "ABC01I", "ABCD", "ABC!23"]) {
      expect(await redeemTableCode(code)).toEqual({ ok: false, error: "That code doesn't look right." });
    }
    expect(db.update).not.toHaveBeenCalled();
    expect(store.set).not.toHaveBeenCalled();
  });

  it("issues a random httpOnly cookie after redeeming a normalized code", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: input.id }]);
    const update = { set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning }) }) };
    vi.mocked(db.update).mockReturnValue(update as unknown as ReturnType<typeof db.update>);
    expect(await redeemTableCode(" abc-de2 ")).toEqual({ ok: true });
    expect(store.set).toHaveBeenCalledWith(TABLE_COOKIE, expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: TABLE_TTL,
    });
    expect(getCurrentPlayer).not.toHaveBeenCalled();
  });

  it("delays a failed redemption and leaves the cookie unchanged", async () => {
    vi.useFakeTimers();
    try {
      const update = { set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: async () => [] }) }) };
      vi.mocked(db.update).mockReturnValue(update as unknown as ReturnType<typeof db.update>);
      const result = redeemTableCode("ABCDE2");
      await vi.advanceTimersByTimeAsync(500);
      expect(await result).toEqual({ ok: false, error: "That code isn't valid or has expired. Make a new one on your phone." });
      expect(store.set).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("always clears the cookie even when no table token is present", async () => {
    expect(await closeTable()).toEqual({ ok: true });
    expect(store.delete).toHaveBeenCalledWith(TABLE_COOKIE);
    expect(db.update).not.toHaveBeenCalled();
    expect(getCurrentPlayer).not.toHaveBeenCalled();
  });
});

describe("sharing a pub table's game", () => {
  const live = { id: input.id, kind: "match", mode: "x01", config: input.config, players: [{ id: playerId, name: "Guest", color: "#abcdef" }],
    darts: [{ s: 20, m: 3 }], startedAt: input.startedAt };

  it("tells a closed table it's closed, before touching the game", async () => {
    vi.mocked(getTableSession).mockResolvedValue(null);
    expect(await pushTableLive(0, live)).toMatchObject({ ok: false, closed: true });
    expect(writeLive).not.toHaveBeenCalled();
  });

  it("refuses players outside the table, practice and broken settings", async () => {
    for (const game of [{ ...live, players: [{ id: hostId, name: "Host", color: "#000" }] }, { ...live, kind: "practice" },
      { ...live, config: { startScore: 5 } }, { ...live, darts: [{ s: 21, m: 3 }] }]) {
      expect(await pushTableLive(0, game)).toMatchObject({ ok: false, closed: false });
    }
    expect(await pushTableLive(-1, live)).toMatchObject({ ok: false, closed: false });
    expect(writeLive).not.toHaveBeenCalled();
  });

  it("writes the game, or its removal, against the revision the device last saw", async () => {
    vi.mocked(writeLive).mockResolvedValue({ ok: true, rev: 4 });
    expect(await pushTableLive(3, live)).toEqual({ ok: true, rev: 4 });
    expect(writeLive).toHaveBeenLastCalledWith(input.id, 3, live);
    await pushTableLive(4, null);
    expect(writeLive).toHaveBeenLastCalledWith(input.id, 4, null);
    expect(getCurrentPlayer).not.toHaveBeenCalled();
  });
});
