"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { roomSnapshot, throwRoomDart, undoRoomDart } from "../app/online-actions";
import { sameDart, type Dart } from "./darts/board";
import { turnOf } from "./darts/rooms";
import type { RoomConnection, RoomEvent, RoomSnapshot } from "./rooms-types";
import { createClient } from "./supabase/client";

type Pending = { dart: Dart; gameId: string; seq?: number };
type Flight = { entry: Pending; seq: number; confirmed: boolean };
const delays = [1000, 2000, 5000, 10000, 30000];
const identical = (a: Dart, b: Dart) => a.t === b.t && sameDart(a, b);

/** A per-hook external store keeps websocket callbacks and queued actions on the same state. */
export class RoomStore {
  private confirmed: RoomSnapshot;
  private queue: Pending[] = [];
  private flight: Flight | null = null;
  private undoing: { gameId: string; seq: number; dart: Dart; confirmed: boolean } | null = null;
  private online = new Set<string>();
  private connected = false;
  private error: string | null = null;
  private listeners = new Set<() => void>();
  private value: RoomConnection;
  private revision = 0;
  private epoch = 0;
  private active = false;
  private refreshPromise: Promise<void> | null = null;
  private refreshAgain = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private authTimer: ReturnType<typeof setTimeout> | undefined;
  private retries = 0;

  constructor(initial: RoomSnapshot, private meId: string) {
    this.confirmed = initial;
    this.value = this.snapshot();
  }

  private snapshot(): RoomConnection {
    const game = this.confirmed.game;
    let room = this.confirmed;
    if (game) {
      const darts = this.undoing?.gameId === game.id && !this.undoing.confirmed && game.darts.length === this.undoing.seq + 1
        ? game.darts.slice(0, -1) : game.darts;
      room = { ...room, game: { ...game, darts: [...darts, ...this.queue.map((p) => p.dart)] } };
    }
    return { room, online: this.online, connected: this.connected, pending: this.queue.length, error: this.error,
      throwDart: this.throwDart, undo: this.undo, refresh: this.refresh };
  }

  private publish() {
    this.value = this.snapshot();
    for (const listener of this.listeners) listener();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getSnapshot = () => this.value;

  private accept(room: RoomSnapshot) {
    const game = room.game;
    if (!game || game.id !== this.confirmed.game?.id || game.saved || room.status !== "playing") {
      this.queue = [];
    } else {
      // A refresh or our own broadcast can confirm a request whose HTTP response was lost.
      let conflict = false;
      this.queue = this.queue.filter((entry) => {
        if (entry.seq === undefined || entry.seq >= game.darts.length) return true;
        if (!identical(game.darts[entry.seq], entry.dart)) conflict = true;
        else {
          if (this.flight?.entry === entry) this.flight.confirmed = true;
          this.error = null;
        }
        return false;
      });
      if (conflict) {
        this.queue = [];
        this.error = "Your darts changed on another device. Please try again.";
      }
    }
    if (this.undoing && game?.id === this.undoing.gameId &&
      (game.darts.length <= this.undoing.seq || !identical(game.darts[this.undoing.seq], this.undoing.dart))) this.undoing.confirmed = true;
    this.confirmed = room;
    this.revision++;
    this.publish();
  }

  refresh = (): Promise<void> => {
    if (!this.active) return Promise.resolve();
    if (this.refreshPromise) {
      this.refreshAgain = true;
      return this.refreshPromise;
    }
    const epoch = this.epoch;
    const request = async () => {
      // Coalesce requests, and discard snapshots overtaken by broadcasts or HTTP acknowledgements.
      for (let attempt = 0; attempt < 3; attempt++) {
        this.refreshAgain = false;
        const revision = this.revision;
        try {
          const result = await roomSnapshot(this.confirmed.id);
          if (!this.active || epoch !== this.epoch) return;
          if (!result.ok) {
            this.error = result.error;
            this.publish();
            return;
          }
          if (revision !== this.revision) this.refreshAgain = true;
          else this.accept(result.room);
        } catch {
          if (this.active && epoch === this.epoch) {
            this.error = "Couldn't sync the room. Reconnecting…";
            this.publish();
          }
          return;
        }
        if (!this.refreshAgain) return;
      }
    };
    this.refreshPromise = request().finally(() => {
      if (epoch !== this.epoch) return;
      this.refreshPromise = null;
      if (this.active) {
        if (this.refreshAgain) void this.refresh();
        else void this.pump();
      }
    });
    return this.refreshPromise;
  };

  private scheduleRetry() {
    if (!this.active || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.pump();
    }, delays[Math.min(this.retries++, delays.length - 1)]);
  }

  private async pump() {
    if (!this.active || this.flight || this.undoing || this.refreshPromise || this.retryTimer || !this.queue.length) return;
    const game = this.confirmed.game;
    const entry = this.queue[0];
    if (!game || game.id !== entry.gameId || game.saved || this.confirmed.status !== "playing") {
      this.queue = [];
      this.publish();
      return;
    }
    const seq = entry.seq ?? game.darts.length;
    entry.seq = seq;
    const flight: Flight = { entry, seq, confirmed: false };
    this.flight = flight;
    const epoch = this.epoch;
    try {
      const result = await throwRoomDart(this.confirmed.id, game.id, seq, entry.dart);
      if (!this.active || epoch !== this.epoch) return;
      if (result.ok) {
        const current = this.confirmed.game;
        if (current?.id === game.id && !flight.confirmed) {
          if (current.darts.length === seq) {
            this.accept({ ...this.confirmed, game: { ...current, darts: [...current.darts, entry.dart] } });
          } else if (!current.darts[seq] || !identical(current.darts[seq], entry.dart)) {
            this.queue = [];
            void this.refresh();
          }
        }
        this.queue = this.queue.filter((p) => p !== entry);
        this.error = null;
        this.retries = 0;
      } else {
        this.queue = [];
        if (result.error === "conflict") void this.refresh();
        else this.error = result.error;
      }
    } catch {
      if (!this.active || epoch !== this.epoch) return;
      if (this.queue.includes(entry)) {
        this.error = "Connection lost. Your darts will retry automatically.";
        this.scheduleRetry();
      }
    } finally {
      if (epoch === this.epoch) {
        this.flight = null;
        this.publish();
        void this.pump();
      }
    }
  }

  throwDart = (input: Dart) => {
    const room = this.value.room, game = room.game;
    if (!this.active || !game || game.saved || room.status !== "playing" || this.undoing) return false;
    const position = room.players.find((p) => p.id === this.meId)?.position;
    if (turnOf(room.settings.mode, room.settings.config, room.players.length, game.darts) !== position) return false;
    const dart = { ...input, t: input.t ?? Date.now() };
    this.queue.push({ dart, gameId: game.id });
    this.error = null;
    this.publish();
    void this.pump();
    return true;
  };

  undo = () => {
    if (!this.active || this.undoing) return;
    const lastPending = this.queue.at(-1);
    if (lastPending) {
      if (lastPending !== this.flight?.entry) {
        this.queue.pop();
        this.publish();
        if (lastPending.seq !== undefined) void this.refresh();
      }
      return;
    }
    const room = this.confirmed, game = room.game;
    if (!game || game.saved || room.status !== "playing" || !game.darts.length || this.flight) return;
    const seq = game.darts.length - 1;
    const player = turnOf(room.settings.mode, room.settings.config, room.players.length, game.darts.slice(0, seq));
    if (player === null || room.players[player]?.id !== this.meId) return;
    this.undoing = { gameId: game.id, seq, dart: game.darts[seq], confirmed: false };
    this.publish();
    const epoch = this.epoch;
    void (async () => {
      try {
        const result = await undoRoomDart(room.id, game.id, seq);
        if (!this.active || epoch !== this.epoch) return;
        const current = this.confirmed.game;
        if (result.ok) {
          if (!this.undoing?.confirmed && current?.id === game.id && current.darts.length === seq + 1 && identical(current.darts[seq], game.darts[seq])) {
            this.accept({ ...this.confirmed, game: { ...current, darts: current.darts.slice(0, -1) } });
          }
          this.error = null;
        } else this.error = result.error === "conflict" ? null : result.error;
      } catch {
        if (this.active && epoch === this.epoch) this.error = "Couldn't undo the dart. Please try again.";
      } finally {
        if (epoch === this.epoch) {
          this.undoing = null;
          this.publish();
          void this.refresh();
        }
      }
    })();
  };

  /** Public for focused store tests; only validated private-channel payloads reach this in production. */
  receive = (event: RoomEvent) => {
    if (!this.active) return;
    if (event.type === "room") { void this.refresh(); return; }
    const game = this.confirmed.game;
    if (!game || event.gameId !== game.id) return;
    if (event.type === "dart") {
      if (event.seq < game.darts.length) return;
      if (event.seq === game.darts.length) this.accept({ ...this.confirmed, game: { ...game, darts: [...game.darts, event.dart] } });
      else void this.refresh();
    } else if (event.seq === game.darts.length - 1) {
      this.accept({ ...this.confirmed, game: { ...game, darts: game.darts.slice(0, -1) } });
    } else void this.refresh();
  };

  start = () => {
    this.active = true;
    const epoch = ++this.epoch;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | undefined;
    const resume = () => {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
      void this.refresh();
    };
    const visible = () => { if (document.visibilityState === "visible") resume(); };
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", visible);
    const connect = async () => {
      try {
        await supabase.realtime.setAuth();
        if (!this.active || epoch !== this.epoch) return;
        channel = supabase.channel(`room:${this.confirmed.id}`, { config: { private: true, presence: { key: this.meId } } });
        channel.on("presence", { event: "sync" }, () => {
          if (epoch !== this.epoch) return;
          this.online = new Set(Object.keys(channel!.presenceState()));
          this.publish();
        });
        for (const event of ["dart", "undo", "room"] as const) {
          channel.on("broadcast", { event }, ({ payload }) => {
            if (epoch === this.epoch && payload?.type === event) this.receive(payload as RoomEvent);
          });
        }
        channel.subscribe((status) => {
          if (!this.active || epoch !== this.epoch) return;
          this.connected = status === "SUBSCRIBED";
          if (!this.connected) this.online = new Set();
          this.publish();
          if (this.connected) {
            void channel!.track({ playerId: this.meId });
            resume();
          }
        });
      } catch {
        if (!this.active || epoch !== this.epoch) return;
        this.error = "Couldn't connect to the room. Reconnecting…";
        this.publish();
        this.authTimer = setTimeout(() => { void connect(); }, 2000);
      }
    };
    void connect();
    return () => {
      this.active = false;
      this.epoch++;
      clearTimeout(this.retryTimer);
      clearTimeout(this.authTimer);
      this.retryTimer = undefined;
      this.flight = null;
      this.undoing = null;
      this.refreshPromise = null;
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", visible);
      if (channel) void supabase.removeChannel(channel);
    };
  };
}

export function useRoom(initial: RoomSnapshot, meId: string): RoomConnection {
  // One store per mounted room. Server re-renders (revalidation after a save) hand in a fresh
  // `initial`, but the live store is already newer, so it must not be rebuilt and reconnect.
  const [store] = useState(() => new RoomStore(initial, meId));
  const connection = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => store.start(), [store]);
  return connection;
}
