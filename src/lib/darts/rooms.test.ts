import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomStore } from "../use-room";
import type { RoomActionResult, RoomSnapshot } from "../rooms-types";
import { MISS, visitTotal, type Dart } from "./board";
import { isGameFinished, rotate, turnOf } from "./rooms";

const x01 = { startScore: 101, out: "double" as const, legs: 1, sets: 1 };
const cricket = { variant: "standard" as const, legs: 1 };

describe("online room replay", () => {
  it("advances after three darts and wraps in player order", () => {
    expect(turnOf("x01", x01, 2, [MISS, MISS])).toBe(0);
    expect(turnOf("x01", x01, 2, [MISS, MISS, MISS])).toBe(1);
    expect(turnOf("x01", x01, 2, Array(6).fill(MISS))).toBe(0);
  });

  it("ends a busted visit before the third dart", () => {
    expect(turnOf("x01", x01, 2, [{ s: 20, m: 3 }, { s: 20, m: 3 }])).toBe(1);
  });

  it("advances a whole visit total, including a bust", () => {
    expect(turnOf("x01", x01, 2, [visitTotal(60)])).toBe(1);
    expect(turnOf("x01", x01, 2, [visitTotal(120)])).toBe(1);
  });

  it("uses cricket turns and rotates the first throw between legs", () => {
    expect(turnOf("cricket", cricket, 3, Array(3).fill(MISS))).toBe(1);
    expect(turnOf("cricket", cricket, 3, Array(9).fill(MISS))).toBe(0);
    const close: Dart[] = [20, 19, 18, 17, 16, 15, 25].flatMap<Dart>((s) => s === 25 ? [{ s, m: 2 }, { s, m: 1 }] : [{ s, m: 3 }]);
    // Keep the opponent's visits between the winning player's visits.
    const darts = [...close.slice(0, 3), MISS, MISS, MISS, ...close.slice(3, 6), MISS, MISS, MISS, ...close.slice(6)];
    expect(turnOf("cricket", { ...cricket, legs: 2 }, 2, darts)).toBe(1);
    expect(turnOf("cricket", cricket, 2, darts)).toBeNull();
  });

  it("returns null only when the match finishes", () => {
    const darts: Dart[] = [{ s: 20, m: 3 }, { s: 1, m: 1 }, { s: 20, m: 2 }];
    expect(isGameFinished("x01", x01, 2, darts.slice(0, 2))).toBe(false);
    expect(isGameFinished("x01", x01, 2, darts)).toBe(true);
    expect(turnOf("x01", x01, 2, darts)).toBeNull();
    expect(turnOf("x01", { ...x01, legs: 2 }, 2, darts)).toBe(1);
    expect(turnOf("x01", x01, 2, [visitTotal(101, { atDouble: 1 })])).toBeNull();
  });

  it("rotates rematches without mutating the original order", () => {
    const players = ["a", "b", "c"];
    expect(rotate(players)).toEqual(["b", "c", "a"]);
    expect(players).toEqual(["a", "b", "c"]);
    expect(rotate([])).toEqual([]);
    expect(rotate(["a"])).toEqual(["a"]);
  });
});


const actions = vi.hoisted(() => ({ snapshot: vi.fn(), throwDart: vi.fn(), undo: vi.fn(), createClient: vi.fn() }));
vi.mock("../../app/online-actions", () => ({ roomSnapshot: actions.snapshot, throwRoomDart: actions.throwDart, undoRoomDart: actions.undo }));
vi.mock("../supabase/client", () => ({ createClient: actions.createClient }));

function roomFixture(): RoomSnapshot {
  return { id: "room", code: "ABCD", hostId: "a", status: "playing", settings: { mode: "x01", config: { ...x01, startScore: 501 }, ranked: true },
    players: [{ id: "a", name: "A", color: "#123456", position: 0 }, { id: "b", name: "B", color: "#654321", position: 1 }],
    game: { id: "game", startedAt: "2026-10-21T12:00:00.000Z", darts: [], saved: false } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settle() { for (let i = 0; i < 16; i++) await Promise.resolve(); }

describe("room optimistic synchronization", () => {
  let stop: (() => void) | undefined;
  function mount(room = roomFixture(), meId = "a") {
    const store = new RoomStore(room, meId);
    stop = store.start();
    return store;
  }
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
    actions.snapshot.mockReset().mockResolvedValue({ ok: true, room: roomFixture() });
    actions.throwDart.mockReset().mockResolvedValue({ ok: true });
    actions.undo.mockReset().mockResolvedValue({ ok: true });
    const channel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis(), track: vi.fn(), presenceState: () => ({}) };
    actions.createClient.mockReset().mockReturnValue({ realtime: { setAuth: vi.fn().mockResolvedValue(undefined) },
      channel: vi.fn(() => channel), removeChannel: vi.fn().mockResolvedValue(undefined) });
  });
  afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("serializes an optimistic visit and deduplicates the broadcast arriving before HTTP", async () => {
    const first = deferred<RoomActionResult>();
    actions.throwDart.mockReturnValueOnce(first.promise);
    const store = mount();
    store.throwDart({ s: 20, m: 1, t: 1 });
    store.throwDart({ s: 20, m: 1, t: 2 });
    store.throwDart({ s: 20, m: 1, t: 3 });
    store.throwDart({ s: 20, m: 1, t: 4 });
    expect(store.getSnapshot().pending).toBe(3);
    expect(store.getSnapshot().room.game!.darts).toHaveLength(3);
    expect(actions.throwDart).toHaveBeenCalledTimes(1);
    store.receive({ type: "dart", gameId: "game", seq: 0, dart: { s: 20, m: 1, t: 1 } });
    expect(store.getSnapshot().pending).toBe(2);
    expect(store.getSnapshot().room.game!.darts).toHaveLength(3);
    first.resolve({ ok: true });
    await settle();
    expect(actions.throwDart.mock.calls.map((args) => args[2])).toEqual([0, 1, 2]);
    expect(store.getSnapshot().pending).toBe(0);
    expect(store.getSnapshot().room.game!.darts).toHaveLength(3);
    store.receive({ type: "dart", gameId: "game", seq: 2, dart: { s: 20, m: 1, t: 3 } });
    expect(store.getSnapshot().room.game!.darts).toHaveLength(3);
  });

  it("retries a network failure with the original sequence and timestamp", async () => {
    actions.throwDart.mockRejectedValueOnce(new Error("offline"));
    const store = mount();
    store.throwDart({ s: 1, m: 1 });
    await settle();
    expect(store.getSnapshot().pending).toBe(1);
    const sent = actions.throwDart.mock.calls[0][3];
    expect(sent.t).toBeTypeOf("number");
    await vi.advanceTimersByTimeAsync(1000);
    expect(actions.throwDart).toHaveBeenNthCalledWith(2, "room", "game", 0, sent);
    expect(store.getSnapshot().pending).toBe(0);
    expect(store.getSnapshot().error).toBeNull();
  });

  it("resyncs a lost acknowledgement on online without submitting the dart twice", async () => {
    const dart: Dart = { s: 20, m: 3, t: 1 };
    actions.throwDart.mockRejectedValueOnce(new Error("lost response"));
    const room = roomFixture(); room.game!.darts = [dart];
    actions.snapshot.mockResolvedValue({ ok: true, room });
    const store = mount();
    store.throwDart(dart);
    await settle();
    window.dispatchEvent(new Event("online"));
    await settle();
    expect(actions.throwDart).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().pending).toBe(0);
    expect(store.getSnapshot().room.game!.darts).toEqual([dart]);
  });

  it("drops the queue and refreshes after a sequence conflict", async () => {
    actions.throwDart.mockResolvedValueOnce({ ok: false, error: "conflict" });
    const store = mount();
    store.throwDart(MISS);
    store.throwDart(MISS);
    await settle();
    expect(store.getSnapshot().pending).toBe(0);
    expect(actions.snapshot).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().room.game!.darts).toEqual([]);
  });

  it("undoes a queued dart but cannot remove the dart currently in flight", async () => {
    const first = deferred<RoomActionResult>();
    actions.throwDart.mockReturnValueOnce(first.promise);
    const store = mount();
    store.throwDart(MISS); store.throwDart(MISS);
    store.undo();
    expect(store.getSnapshot().pending).toBe(1);
    store.undo();
    expect(store.getSnapshot().pending).toBe(1);
    expect(actions.undo).not.toHaveBeenCalled();
    first.resolve({ ok: true }); await settle();
  });

  it("determines undo ownership with replay after a bust", async () => {
    const room = roomFixture();
    room.settings = { mode: "x01", config: x01, ranked: false };
    room.game!.darts = [{ s: 20, m: 3 }, { s: 20, m: 3 }];
    actions.snapshot.mockResolvedValue({ ok: true, room: { ...room, game: { ...room.game!, darts: room.game!.darts.slice(0, -1) } } });
    const store = mount(room);
    store.undo();
    expect(store.getSnapshot().room.game!.darts).toHaveLength(1);
    await settle();
    expect(actions.undo).toHaveBeenCalledWith("room", "game", 1);
  });

  it("does not resurrect a dart when its echo and undo precede its HTTP acknowledgement", async () => {
    const first = deferred<RoomActionResult>();
    actions.throwDart.mockReturnValueOnce(first.promise);
    const store = mount();
    const dart: Dart = { s: 20, m: 1, t: 1 };
    store.throwDart(dart);
    store.receive({ type: "dart", gameId: "game", seq: 0, dart });
    store.receive({ type: "undo", gameId: "game", seq: 0 });
    first.resolve({ ok: true }); await settle();
    expect(store.getSnapshot().room.game!.darts).toEqual([]);
  });

  it("ignores old-game broadcasts and refreshes on gaps", async () => {
    const store = mount();
    store.receive({ type: "dart", gameId: "old-game", seq: 0, dart: MISS });
    expect(actions.snapshot).not.toHaveBeenCalled();
    store.receive({ type: "dart", gameId: "game", seq: 2, dart: MISS });
    await settle();
    expect(actions.snapshot).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().room.game!.darts).toEqual([]);
  });

  it("discards a stale refresh overtaken by a broadcast", async () => {
    const stale = deferred<RoomActionResult<{ room: RoomSnapshot }>>();
    const fresh = roomFixture(); fresh.game!.darts = [{ s: 20, m: 1, t: 1 }];
    actions.snapshot.mockReturnValueOnce(stale.promise).mockResolvedValue({ ok: true, room: fresh });
    const store = mount();
    const refreshing = store.refresh();
    store.receive({ type: "dart", gameId: "game", seq: 0, dart: fresh.game!.darts[0] });
    stale.resolve({ ok: true, room: roomFixture() });
    await refreshing;
    expect(actions.snapshot).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().room.game!.darts).toEqual(fresh.game!.darts);
  });

  it("blocks throws for saved games and other players' turns", () => {
    const room = roomFixture(); room.game!.saved = true;
    const store = mount(room);
    store.throwDart(MISS);
    expect(actions.throwDart).not.toHaveBeenCalled();
    stop?.();
    const other = mount(roomFixture(), "b");
    other.throwDart(MISS);
    expect(actions.throwDart).not.toHaveBeenCalled();
  });
});
