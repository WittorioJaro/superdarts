"use client";

import { useSyncExternalStore } from "react";
import { pushTableLive } from "@/app/table-actions";
import { type ActiveGame, createGameStore, type GameStore, type PendingSave, toPendingSave } from "./game-store";
import type { SaveResult } from "./persist-game";
import { SAVE_ERROR, type LiveState, type PushResult } from "./pub-table-types";
import { createSync, type SyncResult } from "./sync";

const POLL_MS = 1500;

/** What the screen should tell the players about the link to the other device. */
export type LiveStatus = { notice: string | null; closed: string | null };

/** Two snapshots of a game hold the same darts. */
export function sameGame(a: { id: string; darts: ActiveGame["darts"] }, b: { id: string; darts: ActiveGame["darts"] }) {
  return a.id === b.id && JSON.stringify(a.darts) === JSON.stringify(b.darts);
}

/**
 * A pub table's game store, shared between the table's computer and the host's phone through the server.
 *
 * Each device keeps playing from its own storage, so a dropped connection never stops the scoring. Changes go up
 * against the last revision this device saw; if the other device wrote first, its version wins and this one adopts it.
 *
 * A finished game waits in `awaiting` until a write is accepted after it, which proves the other device hadn't changed
 * it, and only then joins the save queue. Once the server has it, the game is marked saved on both screens.
 *
 * `tableId` is the host's phone; without it, the table's computer. `key` names this table's link on the device.
 */
export function createLiveTable(opts: {
  prefix: string;
  key: string;
  tableId?: string;
  save: (game: PendingSave) => Promise<SaveResult>;
}) {
  const { prefix, tableId } = opts;
  const META = `${prefix}.live.${opts.key}`;
  type Meta = { rev: number; dirty: boolean; awaiting: PendingSave[] };

  function readMeta(): Meta {
    try {
      const raw = localStorage.getItem(META);
      if (raw) return { awaiting: [], ...(JSON.parse(raw) as Partial<Meta>) } as Meta;
    } catch {}
    // A game already on this device, from before it was shared, still needs to go up.
    return { rev: 0, dirty: localStorage.getItem(`${prefix}.active`) !== null, awaiting: [] };
  }
  function writeMeta(m: Meta) {
    localStorage.setItem(META, JSON.stringify(m));
  }

  let version = 0;
  let status: LiveStatus = { notice: null, closed: null };
  const listeners = new Set<() => void>();
  function setStatus(next: Partial<LiveStatus>) {
    status = { ...status, ...next };
    for (const l of listeners) l();
  }

  function changed() {
    version++;
    writeMeta({ ...readMeta(), dirty: true });
    void push();
  }

  const store: GameStore = createGameStore(prefix, {
    onSet: changed,
    queueSave(g) {
      const m = readMeta();
      writeMeta({ ...m, awaiting: [...m.awaiting.filter((p) => p.id !== g.id), toPendingSave(g)] });
      changed();
    },
  });

  function adopt(state: LiveState) {
    store.adoptActive(state.game);
    writeMeta({ rev: state.rev, dirty: false, awaiting: [] });
  }

  const sendSaves = createSync(store, opts.save);
  /** Saves what's queued, then marks the shared game saved if it's one of them. */
  async function sync(): Promise<SyncResult> {
    await push();
    const res = await sendSaves();
    const active = store.active();
    if (active && !active.saved && res.savedGames.some((g) => sameGame(g, active))) store.setActive({ ...active, saved: true });
    if (res.errors.length) {
      store.setPref(SAVE_ERROR, res.errors[0]);
      setStatus({ notice: `A game couldn't be saved: ${res.errors[0]}` });
    }
    return res;
  }

  let inflight: Promise<void> | null = null;
  function push(): Promise<void> {
    inflight ??= pushAll().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  async function pushAll() {
    while (!status.closed && readMeta().dirty) {
      const sent = version;
      const before = readMeta();
      let res: PushResult;
      try {
        res = await pushTableLive(before.rev, store.active(), tableId);
      } catch {
        return; // Offline. The next poll tries again.
      }
      if (res.ok) {
        // Nobody wrote since this device's last revision, so every game it finished in between is the real one.
        const now = readMeta();
        const confirmed = now.awaiting.filter((p) => before.awaiting.some((b) => b.id === p.id && sameGame(b, p)));
        writeMeta({ rev: res.rev, dirty: version !== sent, awaiting: now.awaiting.filter((p) => !confirmed.includes(p)) });
        for (const p of confirmed) store.addPending(p);
        if (confirmed.length) void sync();
      } else if (res.conflict) {
        adopt(res);
        setStatus({ notice: "The score changed on the other device. Showing its version." });
        return;
      } else if (res.closed) {
        setStatus({ closed: res.error });
        return;
      } else {
        // The server will never take this version, so stop offering it and keep scoring here.
        writeMeta({ ...readMeta(), dirty: false });
        setStatus({ notice: `The other device isn't getting updates: ${res.error}` });
        return;
      }
    }
  }

  // Bumped when a screen disconnects, so a request still out can't bring back a game from before.
  let generation = 0;

  async function poll(signal: AbortSignal) {
    if (status.closed || inflight) return;
    if (readMeta().dirty) return push();
    const gen = generation;
    const rev = readMeta().rev;
    const url = `/t/live?rev=${rev}${tableId ? `&table=${tableId}` : ""}`;
    let body: Partial<LiveState>;
    try {
      const res = await fetch(url, { cache: "no-store", signal });
      if (gen !== generation) return;
      if (res.status === 410) return setStatus({ closed: "This table has been closed." });
      if (!res.ok) return;
      body = await res.json();
    } catch {
      return;
    }
    // Whatever the players did while the request was out takes priority over it.
    if (gen !== generation || inflight || readMeta().dirty || readMeta().rev !== rev || typeof body.rev !== "number") return;
    if (body.rev !== rev && "game" in body) adopt({ rev: body.rev, game: (body.game ?? null) as ActiveGame | null });
  }

  /** Keeps the two devices in step while a screen is open. Returns the cleanup. */
  function connect() {
    const abort = new AbortController();
    const tick = () => void poll(abort.signal);
    tick();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") tick();
    }, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
    return () => {
      generation++;
      abort.abort();
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("online", tick);
    };
  }

  function subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }

  return {
    store,
    sync,
    connect,
    useStatus: () => useSyncExternalStore(subscribe, () => status, () => status),
    dismissNotice: () => setStatus({ notice: null }),
  };
}

export type LiveTable = ReturnType<typeof createLiveTable>;
