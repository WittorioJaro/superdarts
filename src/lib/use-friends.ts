"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Activity, FriendPresence, FriendsConnection, RoomInvite } from "./friends-types";
import type { GamePlayer } from "./game-store";
import { createClient } from "./supabase/client";

const delays = [1000, 2000, 4000, 8000, 15000, 30000];
const inviteLifetime = 10 * 60 * 1000;
const activities = new Set<Activity>(["home", "practice", "match", "room", "stats"]);
type Channel = ReturnType<ReturnType<typeof createClient>["channel"]>;

function isPlayer(value: unknown): value is GamePlayer {
  if (!value || typeof value !== "object") return false;
  const p = value as GamePlayer;
  return typeof p.id === "string" && typeof p.name === "string" && typeof p.color === "string" &&
    (p.avatarUrl == null || typeof p.avatarUrl === "string");
}

function isPresence(value: unknown): value is FriendPresence {
  if (!isPlayer(value)) return false;
  const p = value as FriendPresence;
  return activities.has(p.activity) && Number.isFinite(p.since);
}

function isInvite(value: unknown): value is RoomInvite {
  if (!value || typeof value !== "object") return false;
  const invite = value as RoomInvite;
  return typeof invite.id === "string" && typeof invite.code === "string" && typeof invite.title === "string" &&
    Number.isFinite(invite.sentAt) && isPlayer(invite.from);
}

/** A single store per mounted provider; route/activity updates only change the tracked meta. */
class FriendsStore {
  private listeners = new Set<() => void>();
  private online: FriendPresence[] = [];
  private invites: RoomInvite[] = [];
  private connected = false;
  private presence: FriendPresence;
  private value: FriendsConnection;
  private track: (() => void) | undefined;
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  private active = false;

  constructor(me: GamePlayer, activity: Activity) {
    this.presence = { id: me.id, name: me.name, color: me.color, avatarUrl: me.avatarUrl, activity, since: Date.now() };
    this.value = this.snapshot();
  }

  private snapshot(): FriendsConnection {
    return { online: this.online, invites: this.invites, connected: this.connected, dismiss: this.dismiss };
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

  update(me: GamePlayer, activity: Activity) {
    const previous = this.presence;
    if (previous.id === me.id && previous.name === me.name && previous.color === me.color &&
      previous.avatarUrl === me.avatarUrl && previous.activity === activity) return;
    this.presence = { id: me.id, name: me.name, color: me.color, avatarUrl: me.avatarUrl, activity,
      since: previous.activity === activity ? previous.since : Date.now() };
    this.track?.();
  }

  private expire = () => {
    clearTimeout(this.expiryTimer);
    this.expiryTimer = undefined;
    const now = Date.now();
    const current = this.invites.filter((invite) => invite.sentAt + inviteLifetime > now);
    if (current.length !== this.invites.length) {
      this.invites = current;
      this.publish();
    }
    if (this.active && this.invites.length) {
      const next = Math.min(...this.invites.map((invite) => invite.sentAt + inviteLifetime));
      this.expiryTimer = setTimeout(this.expire, Math.max(1, next - now));
    }
  };

  dismiss = (id: string) => {
    this.invites = this.invites.filter((invite) => invite.id !== id);
    this.publish();
    this.expire();
  };

  start = () => {
    this.active = true;
    const supabase = createClient();
    let stopped = false, generation = 0, retries = 0, connecting = false;
    let channels: Channel[] = [];
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const ready = new Set<Channel>();
    const retry = () => {
      if (stopped || retryTimer) return;
      this.connected = false;
      this.online = [];
      this.publish();
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void connect();
      }, delays[Math.min(retries++, delays.length - 1)]);
    };
    const connect = async () => {
      if (stopped || connecting) return;
      connecting = true;
      const attempt = ++generation;
      const current = () => !stopped && attempt === generation;
      this.track = undefined;
      ready.clear();
      this.connected = false;
      this.online = [];
      this.publish();
      const old = channels;
      channels = [];
      try {
        await Promise.all(old.map((channel) => supabase.removeChannel(channel)));
        if (!current()) return;
        await supabase.realtime.setAuth();
        if (!current()) return;
        const friends = supabase.channel("friends", { config: { private: true, presence: { key: this.presence.id } } });
        const inbox = supabase.channel(`player:${this.presence.id}`, { config: { private: true } });
        channels = [friends, inbox];
        let tracking = false, trackAgain = false;
        const track = async () => {
          if (!current() || !ready.has(friends)) return;
          trackAgain = true;
          if (tracking) return;
          tracking = true;
          try {
            while (trackAgain && current() && ready.has(friends)) {
              trackAgain = false;
              const status = await friends.track({ ...this.presence });
              if (!current()) return;
              if (status !== "ok") { retry(); break; }
            }
          } catch { if (current()) retry(); }
          finally { tracking = false; }
        };
        this.track = () => { void track(); };
        friends.on("presence", { event: "sync" }, () => {
          if (!current()) return;
          this.online = Object.entries(friends.presenceState()).flatMap(([key, metas]) => {
            if (key === this.presence.id) return [];
            const valid = (metas as unknown[]).filter(isPresence).filter((meta) => meta.id === key);
            if (!valid.length) return [];
            const latest = valid.reduce((a, b) => b.since > a.since ? b : a);
            return [{ id: latest.id, name: latest.name, color: latest.color, avatarUrl: latest.avatarUrl,
              activity: latest.activity, since: latest.since }];
          }).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
          this.publish();
        });
        inbox.on("broadcast", { event: "invite" }, ({ payload }) => {
          if (!current() || !isInvite(payload) || payload.sentAt + inviteLifetime <= Date.now()) return;
          if (this.invites.some((invite) => invite.id === payload.id)) return;
          this.invites = [payload, ...this.invites];
          this.publish();
          this.expire();
        });
        for (const channel of channels) channel.subscribe((status) => {
          if (!current()) return;
          if (status === "SUBSCRIBED") {
            ready.add(channel);
            if (channel === friends) void track();
            this.connected = ready.size === 2;
            if (this.connected) {
              retries = 0;
              clearTimeout(retryTimer);
              retryTimer = undefined;
            }
            this.publish();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            ready.delete(channel);
            retry();
          }
        });
      } catch { if (current()) retry(); }
      finally { connecting = false; }
    };
    const resume = () => {
      this.expire();
      if (this.connected && supabase.realtime.isConnected()) {
        this.track?.();
        return;
      }
      clearTimeout(retryTimer);
      retryTimer = undefined;
      void connect();
    };
    const visible = () => { if (document.visibilityState === "visible") resume(); };
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", visible);
    this.expire();
    void connect();
    return () => {
      stopped = true;
      generation++;
      this.active = false;
      this.track = undefined;
      this.connected = false;
      this.online = [];
      clearTimeout(retryTimer);
      clearTimeout(this.expiryTimer);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", visible);
      for (const channel of channels) void supabase.removeChannel(channel);
    };
  };
}

export function useFriends(me: GamePlayer, activity: Activity): FriendsConnection {
  const [store] = useState(() => new FriendsStore(me, activity));
  const connection = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => store.start(), [store]);
  useEffect(() => { store.update({ id: me.id, name: me.name, color: me.color, avatarUrl: me.avatarUrl }, activity); },
    [store, me.id, me.name, me.color, me.avatarUrl, activity]);
  return connection;
}
