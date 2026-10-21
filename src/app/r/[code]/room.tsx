"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { closeRoom, joinRoom, leaveRoom, startRoom } from "@/app/online-actions";
import { MediaControls, VideoTile, useVideoOn, RoomVideo } from "@/components/room-video";
import { InviteFriends } from "@/components/friends";
import { Avatar, BackLink } from "@/components/ui";
import { gameDetail, gameTitle } from "@/lib/darts/labels";
import type { GamePlayer } from "@/lib/game-store";
import type { RoomConnection, RoomSnapshot } from "@/lib/rooms-types";
import { useRoom } from "@/lib/use-room";
import { OnlineGame } from "./online-game";

const MAX_PLAYERS = 4;

export function Room({ initial, me }: { initial: RoomSnapshot; me: GamePlayer }) {
  if (!initial.players.some((p) => p.id === me.id)) return <JoinRoom room={initial} />;
  return <MemberRoom initial={initial} me={me} />;
}

function MemberRoom({ initial, me }: { initial: RoomSnapshot; me: GamePlayer }) {
  const conn = useRoom(initial, me.id);
  const { room } = conn;
  return (
    <RoomVideo roomId={room.id} meId={me.id}>
      {room.status === "closed" ? (
        <Closed room={room} />
      ) : room.status === "lobby" || !room.game ? (
        <Lobby conn={conn} me={me} />
      ) : (
        <OnlineGame key={room.game.id} conn={conn} me={me} />
      )}
    </RoomVideo>
  );
}

function settingsLine(room: RoomSnapshot) {
  const { mode, config, ranked } = room.settings;
  const c = config as unknown as Record<string, unknown>;
  return `${gameTitle(mode, c)}, ${gameDetail(mode, c).toLowerCase()}${ranked ? ". Ranked" : ""}`;
}

function Shell({ title, back = true, children }: { title: string; back?: boolean; children: React.ReactNode }) {
  return (
    <main className="safe-top safe-bottom mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 pb-10 sm:px-8">
      <header className="flex flex-col gap-1 pt-2">
        {back ? <BackLink href="/online" label="Online" /> : <div className="h-11" />}
        <h1 className="font-display text-5xl font-extrabold tracking-tight">{title}</h1>
      </header>
      {children}
    </main>
  );
}

function JoinRoom({ room }: { room: RoomSnapshot }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [joining, startJoining] = useTransition();
  const host = room.players.find((p) => p.id === room.hostId);
  const open = room.status === "lobby" && room.players.length < MAX_PLAYERS;

  function join() {
    startJoining(async () => {
      try {
        const res = await joinRoom(room.code);
        if (!res.ok) return setError(res.error);
        router.refresh();
      } catch {
        setError("Couldn't reach the server. Check your connection and try again.");
      }
    });
  }

  return (
    <Shell title={host ? `${host.name.split(" ")[0]}'s room` : `Room ${room.code}`}>
      <section className="flex max-w-xl flex-col gap-5 rounded-3xl bg-cabinet p-6">
        <p className="text-xl">{settingsLine(room)}</p>
        <ul className="flex flex-col gap-2">
          {room.players.map((p) => (
            <li key={p.id} className="flex items-center gap-3">
              <Avatar name={p.name} color={p.color} url={p.avatarUrl} size={40} />
              <span className="text-lg font-semibold">{p.name}</span>
              {p.id === room.hostId && <span className="text-sm text-dim">host</span>}
            </li>
          ))}
        </ul>
        {open ? (
          <button
            type="button"
            onClick={join}
            disabled={joining}
            className="h-16 rounded-2xl bg-double font-display text-2xl font-bold transition active:scale-[0.98] disabled:opacity-40"
          >
            {joining ? "Joining…" : "Join the room"}
          </button>
        ) : (
          <p className="text-lg text-dim">
            {room.status === "closed"
              ? "The host has closed this room."
              : room.status === "playing"
                ? "This game has already started. Ask the host to open a new room."
                : "This room is full."}
          </p>
        )}
        {error && (
          <p role="alert" className="text-double">
            {error}
          </p>
        )}
      </section>
    </Shell>
  );
}

function Closed({ room }: { room: RoomSnapshot }) {
  return (
    <Shell title={`Room ${room.code}`}>
      <p className="text-xl text-dim">The host has closed this room. Finished games are in everyone&apos;s stats.</p>
      <Link href="/online" className="self-start rounded-2xl bg-chalk px-8 py-4 font-display text-2xl font-bold text-ink">
        Back to Online
      </Link>
    </Shell>
  );
}

const noop = () => () => {};

function Lobby({ conn, me }: { conn: RoomConnection; me: GamePlayer }) {
  const router = useRouter();
  const { room, online } = conn;
  const host = room.hostId === me.id;
  const hostName = room.players.find((p) => p.id === room.hostId)?.name.split(" ")[0] ?? "The host";
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const [copied, setCopied] = useState(false);
  const video = useVideoOn();
  const link = useSyncExternalStore(
    noop,
    () => `${window.location.origin}/r/${room.code}`,
    () => `/r/${room.code}`,
  );

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    startBusy(async () => {
      try {
        const res = await fn();
        if (!res.ok) return setError(res.error ?? "Something went wrong.");
        setError(null);
        if (after) after();
        else await conn.refresh();
      } catch {
        setError("Couldn't reach the server. Check your connection and try again.");
      }
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Older iPadOS without clipboard permission: select the text so it can be copied by hand.
      document.getElementById("room-link")?.focus();
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function share() {
    try {
      await navigator.share({ title: "Superdarts", text: `Darts? Join my room ${room.code}`, url: link });
    } catch {
      // Cancelled.
    }
  }

  const canShare = useSyncExternalStore(
    noop,
    () => typeof navigator.share === "function",
    () => false,
  );

  const slots = Array.from({ length: Math.max(2, Math.min(MAX_PLAYERS, room.players.length + 1)) }, (_, i) => room.players[i] ?? null);

  return (
    <Shell title={host ? "Your room" : `${hostName}'s room`}>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-6">
          <section aria-labelledby="invite" className="flex flex-col gap-4 rounded-3xl bg-cabinet p-6">
            <h2 id="invite" className="text-sm font-medium text-dim">
              Room code
            </h2>
            <span className="font-display text-7xl leading-none font-extrabold tracking-[0.18em]">{room.code}</span>
            <div className="flex gap-2">
              <input
                id="room-link"
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Invite link"
                className="h-14 min-w-0 flex-1 rounded-2xl border border-wire bg-ink px-4 text-dim outline-none focus:border-chalk"
              />
              <button
                type="button"
                onClick={() => void copy()}
                className={`h-14 shrink-0 rounded-2xl px-5 font-display text-xl font-bold transition active:scale-[0.98] ${copied ? "bg-treble text-ink" : "bg-chalk text-ink"}`}
              >
                {copied ? "Copied" : "Copy link"}
              </button>
              {canShare && (
                <button
                  type="button"
                  onClick={() => void share()}
                  aria-label="Share invite"
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-felt text-chalk transition hover:bg-wire active:scale-[0.98]"
                >
                  <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
                  </svg>
                </button>
              )}
            </div>
          </section>

          <section aria-labelledby="players" className="flex flex-col gap-3">
            <h2 id="players" className="font-display text-2xl font-bold">
              Players
            </h2>
            <ul className="flex flex-col gap-2">
              {slots.map((p, i) =>
                p ? (
                  <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-cabinet p-3">
                    <span className="w-6 text-center font-display text-xl text-dim">{i + 1}</span>
                    <Avatar name={p.name} color={p.color} url={p.avatarUrl} size={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lg font-semibold">
                        {p.name}
                        {p.id === me.id && <span className="ml-2 text-sm font-normal text-dim">you</span>}
                      </span>
                      <span className="block text-sm text-dim">{p.id === room.hostId ? "Host, throws first" : `Throws ${ordinal(i + 1)}`}</span>
                    </span>
                    <Presence here={online.has(p.id) || p.id === me.id} />
                  </li>
                ) : (
                  <li key={`empty-${i}`} className="flex h-[68px] items-center gap-3 rounded-2xl border-2 border-dashed border-wire px-4 text-dim">
                    Waiting for a friend to join…
                  </li>
                ),
              )}
            </ul>
          </section>

          {room.players.length < MAX_PLAYERS && <InviteFriends roomId={room.id} exclude={room.players.map((p) => p.id)} />}
        </div>

        <section aria-labelledby="game" className="flex flex-col gap-5">
          {video ? (
            <div className="flex flex-col gap-3">
              <VideoTile player={me} self className="aspect-video w-full" />
              <MediaControls />
              <p className="text-sm text-dim">
                Friends see your board through your phone: tap &ldquo;Add camera&rdquo; and scan the code. Your voice goes through the iPad unless you pick the
                iPhone.
              </p>
            </div>
          ) : (
            <p className="rounded-2xl bg-cabinet p-4 text-dim">Video and voice aren&apos;t set up yet. You can still play: scores sync live.</p>
          )}

          <div className="flex flex-col gap-1 rounded-2xl bg-cabinet p-4">
            <h2 id="game" className="text-sm font-medium text-dim">
              Game
            </h2>
            <p className="text-xl font-semibold">{settingsLine(room)}</p>
          </div>

          {error && (
            <p role="alert" className="text-double">
              {error}
            </p>
          )}

          {host ? (
            <>
              <button
                type="button"
                disabled={busy || room.players.length < 2}
                onClick={() => act(() => startRoom(room.id))}
                className="flex h-20 flex-col items-center justify-center rounded-2xl bg-double transition active:scale-[0.98] disabled:opacity-40"
              >
                <span className="font-display text-3xl leading-none font-bold">{room.players.length < 2 ? "Waiting for players" : "Start the game"}</span>
                <span className="mt-1 text-sm text-chalk/80">
                  {room.players.length < 2 ? "Send the invite, then start when they're in." : `${room.players.length} players`}
                </span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => act(() => closeRoom(room.id), () => router.push("/online"))}
                className="h-14 rounded-2xl text-lg font-semibold text-dim hover:text-double"
              >
                Close the room
              </button>
            </>
          ) : (
            <>
              <p className="flex h-20 items-center justify-center rounded-2xl bg-felt text-center font-display text-2xl font-bold">
                Waiting for {hostName} to start…
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => act(() => leaveRoom(room.id), () => router.push("/online"))}
                className="h-14 rounded-2xl text-lg font-semibold text-dim hover:text-double"
              >
                Leave the room
              </button>
            </>
          )}
        </section>
      </div>
    </Shell>
  );
}

export function Presence({ here }: { here: boolean }) {
  return (
    <span className={`flex items-center gap-2 text-sm font-medium ${here ? "text-treble" : "text-dim"}`}>
      <span className={`h-2.5 w-2.5 rounded-full ${here ? "bg-treble" : "bg-wire"}`} />
      {here ? "Here" : "Away"}
    </span>
  );
}

function ordinal(n: number) {
  return `${n}${["st", "nd", "rd"][n - 1] ?? "th"}`;
}
