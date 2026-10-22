"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, createContext, useContext, useState, useSyncExternalStore, useTransition } from "react";
import { createRoom, invitePlayer, joinRoom } from "@/app/online-actions";
import { DEFAULT_OPTS, type GameOpts, cricketConfig, x01Config } from "@/components/game-options";
import { Avatar, Sheet } from "@/components/ui";
import { gameDetail, gameTitle } from "@/lib/darts/labels";
import type { Activity, FriendPresence, FriendsConnection } from "@/lib/friends-types";
import { type GamePlayer, gameStore, useActiveGame } from "@/lib/game-store";
import type { RoomSettings } from "@/lib/rooms-types";
import { useFriends } from "@/lib/use-friends";

const Friends = createContext<FriendsConnection | null>(null);

export function useOnlineFriends() {
  return useContext(Friends);
}

function activityFor(path: string, gameKind: "practice" | "match" | undefined): Activity {
  if (path.startsWith("/r/")) return "room";
  if (path.startsWith("/practice")) return "practice";
  if (path.startsWith("/match")) return "match";
  if (path.startsWith("/play")) return gameKind === "match" ? "match" : "practice";
  if (path.startsWith("/players") || path.startsWith("/games")) return "stats";
  return "home";
}

export const ACTIVITY_LABEL: Record<Activity, string> = {
  home: "Online",
  practice: "Practising",
  match: "In a match",
  room: "In a room",
  stats: "Looking at stats",
};

/** Keeps everyone's "who's on" list and room invites live, on every page. Not mounted when signed out. */
export function FriendsProvider({ me, children }: { me: GamePlayer; children: ReactNode }) {
  const path = usePathname();
  const game = useActiveGame();
  const conn = useFriends(me, activityFor(path, game?.kind));
  return (
    <Friends.Provider value={conn}>
      {children}
      <InviteToasts conn={conn} />
    </Friends.Provider>
  );
}

function InviteToasts({ conn }: { conn: FriendsConnection }) {
  const router = useRouter();
  const path = usePathname();
  // Don't nag about the room you're already in.
  const invites = conn.invites.filter((i) => path.toUpperCase() !== `/R/${i.code}`);
  if (invites.length === 0) return null;
  return (
    <div aria-live="polite" className="safe-top pointer-events-none fixed inset-x-0 top-0 z-40 flex flex-col items-center gap-2 px-4">
      {invites.slice(0, 3).map((i) => (
        <div key={i.id} className="animate-drop pointer-events-auto flex w-full max-w-xl items-center gap-4 rounded-3xl border border-brass/60 bg-cabinet p-4 shadow-2xl">
          <Avatar name={i.from.name} color={i.from.color} url={i.from.avatarUrl} size={48} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-semibold">{i.from.name.split(" ")[0]} wants to play</span>
            <span className="block truncate text-dim">{i.title}</span>
          </span>
          <button type="button" onClick={() => conn.dismiss(i.id)} className="h-12 rounded-xl px-3 font-medium text-dim hover:text-chalk">
            Not now
          </button>
          <button
            type="button"
            onClick={() => {
              conn.dismiss(i.id);
              router.push(`/r/${i.code}`);
            }}
            className="h-12 rounded-xl bg-brass px-5 font-display text-xl font-bold text-ink"
          >
            Join
          </button>
        </div>
      ))}
    </div>
  );
}

function savedSettings(): { opts: GameOpts; settings: RoomSettings; line: string } {
  const opts = { ...DEFAULT_OPTS, ...gameStore.prefs<Partial<GameOpts>>("online", {}) };
  const settings: RoomSettings =
    opts.game === "cricket"
      ? { mode: "cricket", config: cricketConfig(opts), ranked: false }
      : { mode: "x01", config: x01Config(opts), ranked: opts.startScore === 501 && opts.ranked };
  const c = settings.config as unknown as Record<string, unknown>;
  return { opts, settings, line: `${gameTitle(settings.mode, c)}, ${gameDetail(settings.mode, c).toLowerCase()}${settings.ranked ? ", ranked" : ""}` };
}

const noop = () => () => {};

/** Home screen row: who's on right now, one tap to challenge them. */
export function OnlineFriends() {
  const conn = useOnlineFriends();
  const router = useRouter();
  const [picked, setPicked] = useState<FriendPresence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  // Settings live on this device, so they're read after hydration.
  const line = useSyncExternalStore(noop, () => savedSettings().line, () => "");

  if (!conn) return null;

  function challenge(friend: FriendPresence) {
    const { settings } = savedSettings();
    startSending(async () => {
      try {
        const created = await createRoom(settings);
        if (!created.ok) return setError(created.error);
        const room = await joinRoom(created.code);
        if (!room.ok) return setError(room.error);
        const sent = await invitePlayer(room.roomId, friend.id);
        if (!sent.ok) return setError(sent.error);
        setPicked(null);
        router.push(`/r/${created.code}`);
      } catch {
        setError("Couldn't reach the server. Check your connection and try again.");
      }
    });
  }

  return (
    <section aria-labelledby="online-now" className="flex flex-col gap-3">
      <h2 id="online-now" className="flex items-center gap-2 text-sm font-medium text-dim">
        <span className={`h-2.5 w-2.5 rounded-full ${conn.online.length ? "bg-treble" : "bg-wire"}`} />
        {conn.online.length ? `Online now, ${conn.online.length}` : "Online now"}
      </h2>
      {conn.online.length === 0 ? (
        // As tall as the row of friends, so the page doesn't shift once presence connects or someone comes online.
        <p className="flex h-[4.25rem] items-center text-dim">
          {conn.connected ? "Nobody else has Superdarts open. Friends show up here the moment they do." : "Checking who's on…"}
        </p>
      ) : (
        <ul className="-mx-5 flex h-[4.25rem] gap-3 overflow-x-auto px-5 pb-1 sm:-mx-8 sm:px-8">
          {conn.online.map((f) => (
            <li key={f.id} className="shrink-0">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setPicked(f);
                }}
                className="flex items-center gap-3 rounded-2xl bg-cabinet py-2.5 pr-5 pl-2.5 text-left transition hover:bg-felt active:scale-[0.98]"
              >
                <span className="relative">
                  <Avatar name={f.name} color={f.color} url={f.avatarUrl} size={44} />
                  <span className="absolute -right-0.5 -bottom-0.5 h-3.5 w-3.5 rounded-full border-2 border-cabinet bg-treble" />
                </span>
                <span>
                  <span className="block text-lg leading-tight font-semibold">{f.name.split(" ")[0]}</span>
                  <span className="block text-sm text-dim">{ACTIVITY_LABEL[f.activity]}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!picked} onClose={() => setPicked(null)} label={picked ? `Play ${picked.name}` : "Play"}>
        {picked && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <Avatar name={picked.name} color={picked.color} url={picked.avatarUrl} size={56} />
              <div>
                <h2 className="font-display text-3xl font-bold">Play {picked.name.split(" ")[0]}</h2>
                <p className="text-dim">
                  {ACTIVITY_LABEL[picked.activity]}. They get a pop-up to join your room.
                </p>
              </div>
            </div>
            {error && (
              <p role="alert" className="text-double">
                {error}
              </p>
            )}
            <button
              type="button"
              disabled={sending}
              onClick={() => challenge(picked)}
              className="flex h-20 flex-col items-center justify-center rounded-2xl bg-double transition active:scale-[0.98] disabled:opacity-40"
            >
              <span className="font-display text-3xl leading-none font-bold">{sending ? "Opening room…" : "Send invite"}</span>
              <span className="mt-1 text-sm text-chalk/80">{line}</span>
            </button>
            <button type="button" onClick={() => router.push("/online")} className="h-14 rounded-2xl font-semibold text-dim hover:text-chalk">
              Change the game first
            </button>
          </div>
        )}
      </Sheet>
    </section>
  );
}

/** In a room's lobby: friends who are on but not in the room yet. */
export function InviteFriends({ roomId, exclude }: { roomId: string; exclude: string[] }) {
  const conn = useOnlineFriends();
  const [sent, setSent] = useState<Record<string, "sending" | "sent" | string>>({});
  if (!conn) return null;
  const friends = conn.online.filter((f) => !exclude.includes(f.id));
  if (friends.length === 0) return null;

  async function invite(id: string) {
    setSent((s) => ({ ...s, [id]: "sending" }));
    try {
      const res = await invitePlayer(roomId, id);
      setSent((s) => ({ ...s, [id]: res.ok ? "sent" : res.error }));
    } catch {
      setSent((s) => ({ ...s, [id]: "Couldn't send. Try again." }));
    }
  }

  return (
    <section aria-labelledby="invite-online" className="flex flex-col gap-2">
      <h2 id="invite-online" className="flex items-center gap-2 text-sm font-medium text-dim">
        <span className="h-2.5 w-2.5 rounded-full bg-treble" />
        Online now
      </h2>
      <ul className="flex flex-col gap-2">
        {friends.map((f) => {
          const state = sent[f.id];
          return (
            <li key={f.id} className="flex items-center gap-3 rounded-2xl bg-cabinet p-3">
              <Avatar name={f.name} color={f.color} url={f.avatarUrl} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{f.name}</span>
                <span className="block truncate text-sm text-dim">
                  {state && state !== "sending" && state !== "sent" ? state : ACTIVITY_LABEL[f.activity]}
                </span>
              </span>
              <button
                type="button"
                disabled={state === "sending" || state === "sent"}
                onClick={() => void invite(f.id)}
                className="h-11 rounded-xl bg-chalk px-4 font-semibold text-ink transition disabled:bg-felt disabled:text-dim"
              >
                {state === "sent" ? "Invited" : state === "sending" ? "Sending…" : "Invite"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
