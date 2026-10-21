"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, use, useEffect, useState, useTransition } from "react";
import { createRoom } from "@/app/online-actions";
import { DEFAULT_OPTS, type GameOpts, GameOptions, cricketConfig, x01Config } from "@/components/game-options";
import { useMe } from "@/components/me";
import { Avatar } from "@/components/ui";
import { gameDetail, gameTitle } from "@/lib/darts/labels";
import { gameStore } from "@/lib/game-store";
import type { RoomSettings, RoomSummary } from "@/lib/rooms-types";

const CODE = /^[A-Z0-9]{4}$/;

/** `rooms` streams in; the forms work before it arrives. */
export function OnlineHome({ rooms }: { rooms: Promise<RoomSummary[]> }) {
  const router = useRouter();
  const [opts, setOpts] = useState<GameOpts>(DEFAULT_OPTS);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, startCreating] = useTransition();

  useEffect(() => {
    const saved = gameStore.prefs<GameOpts | null>("online", null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setOpts({ ...DEFAULT_OPTS, ...saved });
  }, []);

  const canRank = opts.game === "x01" && opts.startScore === 501;

  function create() {
    const settings: RoomSettings =
      opts.game === "cricket"
        ? { mode: "cricket", config: cricketConfig(opts), ranked: false }
        : { mode: "x01", config: x01Config(opts), ranked: canRank && opts.ranked };
    gameStore.setPref("online", opts);
    startCreating(async () => {
      try {
        const res = await createRoom(settings);
        if (!res.ok) return setError(res.error);
        router.push(`/r/${res.code}`);
      } catch {
        setError("Couldn't reach the server. Check your connection and try again.");
      }
    });
  }

  const typed = code.trim().toUpperCase();

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col gap-8">
        <section aria-labelledby="join" className="flex flex-col gap-3 rounded-3xl bg-cabinet p-6">
          <h2 id="join" className="font-display text-2xl font-bold">
            Join a room
          </h2>
          <form
            className="flex gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (CODE.test(typed)) router.push(`/r/${typed}`);
            }}
          >
            <label className="sr-only" htmlFor="code">
              Room code
            </label>
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
              placeholder="CODE"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="h-16 w-40 rounded-xl border border-wire bg-ink px-4 text-center font-display text-4xl font-bold tracking-[0.3em] uppercase outline-none placeholder:text-wire focus:border-chalk"
            />
            <button
              type="submit"
              disabled={!CODE.test(typed)}
              className="h-16 flex-1 rounded-xl bg-chalk font-display text-2xl font-bold text-ink transition active:scale-[0.98] disabled:opacity-40"
            >
              Join
            </button>
          </form>
          <p className="text-sm text-dim">Or just open the invite link your friend sent.</p>
        </section>

        <Suspense>
          <YourRooms rooms={rooms} />
        </Suspense>
      </div>

      <section aria-labelledby="create" className="flex flex-col gap-6">
        <h2 id="create" className="font-display text-2xl font-bold">
          Start a room
        </h2>
        <GameOptions
          opts={opts}
          onChange={setOpts}
          canRank={canRank}
          rankHint={canRank ? "Counts towards everyone's 501 rating." : "Ratings are for 501 only."}
        />
        {error && (
          <p role="alert" className="text-double">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={create}
          disabled={creating}
          className="flex h-20 flex-col items-center justify-center rounded-2xl bg-double transition active:scale-[0.98] disabled:opacity-40"
        >
          <span className="font-display text-3xl leading-none font-bold">{creating ? "Opening room…" : "Open a room"}</span>
          <span className="mt-1 text-sm text-chalk/80">
            {opts.game === "cricket" ? gameDetail("cricket", cricketConfig(opts) as never) : gameDetail("x01", x01Config(opts) as never)}. You get a link to send.
          </span>
        </button>
      </section>
    </div>
  );
}

function YourRooms({ rooms: pending }: { rooms: Promise<RoomSummary[]> }) {
  const rooms = use(pending);
  const meId = useMe()?.id;
  if (rooms.length === 0) return null;
  return (
    <section aria-labelledby="mine" className="flex flex-col gap-3">
      <h2 id="mine" className="font-display text-2xl font-bold">
        Your rooms
      </h2>
      <ul className="flex flex-col gap-3">
        {rooms.map((r) => (
          <li key={r.code}>
            <Link href={`/r/${r.code}`} className="flex items-center gap-4 rounded-2xl bg-cabinet p-4 transition hover:bg-felt active:scale-[0.99]">
              <span className="font-display text-3xl font-bold tracking-widest">{r.code}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {gameTitle(r.settings.mode, r.settings.config as never)}
                  {r.settings.ranked && <span className="ml-2 text-sm font-normal text-brass">Ranked</span>}
                </span>
                <span className="block truncate text-sm text-dim">
                  {r.players.map((p) => (p.id === meId ? "You" : p.name.split(" ")[0])).join(", ")}
                </span>
              </span>
              <span className="flex -space-x-2">
                {r.players.slice(0, 4).map((p) => (
                  <Avatar key={p.id} name={p.name} color={p.color} url={p.avatarUrl} size={32} />
                ))}
              </span>
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${r.status === "playing" ? "bg-treble/20 text-treble" : "bg-felt text-dim"}`}>
                {r.status === "playing" ? "Playing" : "Waiting"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
