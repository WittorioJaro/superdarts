import { beforeEach, describe, expect, it, vi } from "vitest";
import { pushTableLive } from "@/app/table-actions";
import type { ActiveGame } from "./game-store";
import { createLiveTable } from "./table-live";

vi.mock("@/app/table-actions", () => ({ pushTableLive: vi.fn() }));
vi.mock("@/app/actions", () => ({ saveGame: vi.fn() }));

const game = (darts: number): ActiveGame => ({ id: "00000000-0000-4000-8000-000000000010", kind: "match", mode: "x01",
  config: { startScore: 501, out: "double", legs: 1, sets: 1 }, players: [{ id: "p", name: "P", color: "#fff" }],
  darts: Array.from({ length: darts }, () => ({ s: 20, m: 1 })), startedAt: "2026-10-23T12:00:00.000Z" });

const save = vi.fn();
const opts = { prefix: "t", key: "table-1", save };
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.resetAllMocks();
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k), key: (i: number) => [...data.keys()][i] ?? null,
    get length() { return data.size; },
  });
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("fetch", vi.fn());
});

describe("a pub table shared between two screens", () => {
  it("sends each change against the last revision it saw", async () => {
    vi.mocked(pushTableLive).mockResolvedValueOnce({ ok: true, rev: 1 }).mockResolvedValueOnce({ ok: true, rev: 2 });
    const live = createLiveTable(opts);
    live.store.setActive(game(1));
    await flush();
    live.store.setActive(game(2));
    await flush();
    expect(vi.mocked(pushTableLive).mock.calls.map((c) => c[0])).toEqual([0, 1]);
  });

  it("takes the other screen's darts when nothing changed here", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ rev: 3, game: game(4) }));
    const live = createLiveTable({ ...opts, tableId: "00000000-0000-4000-8000-000000000020" });
    const stop = live.connect();
    await flush();
    await flush();
    stop();
    expect(live.store.active()?.darts).toHaveLength(4);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/t/live?rev=0&table=00000000-0000-4000-8000-000000000020");
    expect(pushTableLive).not.toHaveBeenCalled();
  });

  it("adopts the other screen's version when both scored, and says so", async () => {
    vi.mocked(pushTableLive).mockResolvedValue({ ok: false, conflict: true, rev: 5, game: game(7) });
    const live = createLiveTable(opts);
    live.store.setActive(game(1));
    await flush();
    expect(live.store.active()?.darts).toHaveLength(7);
  });

  it("keeps scoring locally while offline and sends it all once back", async () => {
    vi.mocked(pushTableLive).mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ok: true, rev: 1 });
    const live = createLiveTable(opts);
    live.store.setActive(game(3));
    await flush();
    expect(live.store.active()?.darts).toHaveLength(3);
    const stop = live.connect();
    await flush();
    stop();
    expect(pushTableLive).toHaveBeenLastCalledWith(0, game(3), undefined);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shares a game that was already on the computer before sharing existed", async () => {
    localStorage.setItem("t.active", JSON.stringify(game(9)));
    vi.mocked(pushTableLive).mockResolvedValue({ ok: true, rev: 1 });
    const stop = createLiveTable(opts).connect();
    await flush();
    stop();
    expect(pushTableLive).toHaveBeenCalledWith(0, game(9), undefined);
  });

  it("never saves a finished game the other screen had already undone", async () => {
    vi.mocked(pushTableLive).mockResolvedValue({ ok: false, conflict: true, rev: 2, game: game(5) });
    const live = createLiveTable(opts);
    live.store.queueSave(game(6));
    await flush();
    await live.sync();
    expect(save).not.toHaveBeenCalled();
    expect(live.store.pending()).toEqual([]);
    expect(live.store.active()?.darts).toHaveLength(5);
  });

  it("saves once the other screen is known to agree, then marks the game saved on both", async () => {
    vi.mocked(pushTableLive).mockResolvedValueOnce({ ok: true, rev: 1 }).mockResolvedValueOnce({ ok: true, rev: 2 })
      .mockResolvedValue({ ok: true, rev: 3 });
    save.mockResolvedValue({ ok: true });
    const live = createLiveTable(opts);
    live.store.setActive(game(6));
    await flush();
    live.store.queueSave(game(6));
    await live.sync();
    await flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toMatchObject({ id: game(6).id, darts: game(6).darts });
    expect(live.store.active()?.saved).toBe(true);
    expect(vi.mocked(pushTableLive).mock.lastCall?.[1]).toMatchObject({ saved: true });
  });

  it("only marks a game saved after the server took it", async () => {
    vi.mocked(pushTableLive).mockResolvedValue({ ok: true, rev: 1 });
    save.mockResolvedValue({ ok: false, retry: true, error: "busy" });
    const live = createLiveTable(opts);
    live.store.setActive(game(6));
    live.store.queueSave(game(6));
    await live.sync();
    await flush();
    expect(live.store.active()?.saved).toBeUndefined();
    expect(live.store.pending()).toHaveLength(1);
  });

  it("ignores a poll that comes back after the screen disconnected", async () => {
    let answer!: (r: Response) => void;
    vi.mocked(fetch).mockReturnValue(new Promise((r) => (answer = r)));
    const live = createLiveTable(opts);
    const stop = live.connect();
    stop();
    answer(Response.json({ rev: 1, game: game(4) }));
    await flush();
    expect(live.store.active()).toBeNull();
  });
});
