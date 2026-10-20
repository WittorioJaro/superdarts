"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { addGuest } from "@/app/actions";
import { Avatar, Segmented, Sheet } from "@/components/ui";
import type { X01Config } from "@/lib/darts/modes/x01";
import { gameDetail } from "@/lib/darts/labels";
import { type GamePlayer, gameStore, startGame } from "@/lib/game-store";

type Opts = { startScore: number; out: X01Config["out"]; legs: number; sets: number; useSets: boolean };
const DEFAULTS: Opts = { startScore: 501, out: "double", legs: 3, sets: 3, useSets: false };

export function MatchSetup({ players: initial, meId }: { players: GamePlayer[]; meId: string }) {
  const router = useRouter();
  // The counter has no server data, so it can be fully loaded before Start is tapped.
  useEffect(() => router.prefetch("/play"), [router]);
  const [players, setPlayers] = useState(initial);
  const [picked, setPicked] = useState<string[]>([meId]);
  const [opts, setOpts] = useState<Opts>(DEFAULTS);
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestError, setGuestError] = useState<string | null>(null);
  const [adding, startAdding] = useTransition();

  // Restore the last line-up and format, so a rematch next week is one tap.
  useEffect(() => {
    const saved = gameStore.prefs<{ opts?: Opts; picked?: string[] }>("match", {});
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved.opts) setOpts({ ...DEFAULTS, ...saved.opts });
    const known = (saved.picked ?? []).filter((id) => initial.some((p) => p.id === id));
    if (known.length) setPicked(known);
  }, [initial]);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function add() {
    startAdding(async () => {
      const res = await addGuest(guestName);
      if (!res.ok) return setGuestError(res.error);
      setPlayers((ps) => [...ps, res.player]);
      setPicked((p) => [...p, res.player.id]);
      setGuestName("");
      setGuestError(null);
      setGuestOpen(false);
    });
  }

  const config: X01Config = {
    startScore: opts.startScore,
    out: opts.out,
    legs: opts.legs,
    sets: opts.useSets ? opts.sets : 1,
  };

  function start() {
    const current = gameStore.active();
    if (current && current.darts.length > 0 && !window.confirm("Starting a new match ends the game in progress. Start anyway?")) return;
    gameStore.setPref("match", { opts, picked });
    const lineup = picked.map((id) => players.find((p) => p.id === id)!).filter(Boolean);
    startGame({ kind: "match", mode: "x01", config, players: lineup });
    router.push("/play");
  }

  const set = <K extends keyof Opts>(key: K) => (v: Opts[K]) => setOpts((o) => ({ ...o, [key]: v }));

  return (
    <div className="grid gap-8 pb-6 lg:grid-cols-[1.1fr_1fr]">
      <section aria-labelledby="who" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 id="who" className="font-display text-2xl font-bold">
            Who&apos;s playing
          </h2>
          <span className="text-sm text-dim">Tap in throwing order</span>
        </div>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {players.map((p) => {
            const order = picked.indexOf(p.id);
            const on = order >= 0;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(p.id)}
                  className={`relative flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition active:scale-[0.98] ${
                    on ? "border-chalk bg-felt" : "border-transparent bg-cabinet hover:bg-felt"
                  }`}
                >
                  <Avatar name={p.name} color={p.color} url={p.avatarUrl} size={44} />
                  <span className="min-w-0 flex-1 truncate text-lg font-semibold">{p.name}</span>
                  {on && (
                    <span
                      aria-label={`Throws ${order + 1}${["st", "nd", "rd"][order] ?? "th"}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chalk font-display text-lg font-bold text-ink"
                    >
                      {order + 1}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setGuestOpen(true)}
              className="flex h-full min-h-[68px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-wire text-dim transition hover:border-dim hover:text-chalk"
            >
              <span className="text-2xl leading-none">+</span> Add player
            </button>
          </li>
        </ul>
      </section>

      <section aria-labelledby="format" className="flex flex-col gap-6">
        <h2 id="format" className="font-display text-2xl font-bold">
          Game
        </h2>
        <Segmented
          label="Start from"
          value={opts.startScore}
          onChange={set("startScore")}
          options={[301, 501, 701].map((n) => ({ value: n, label: String(n) }))}
        />
        <Segmented
          label="Finish on"
          value={opts.out}
          onChange={set("out")}
          options={[
            { value: "double", label: "Double" },
            { value: "master", label: "Double or treble" },
            { value: "single", label: "Anything" },
          ]}
        />
        <Segmented
          label="Play"
          value={opts.useSets ? "sets" : "legs"}
          onChange={(v) => set("useSets")(v === "sets")}
          options={[
            { value: "legs", label: "Legs" },
            { value: "sets", label: "Sets" },
          ]}
        />
        {opts.useSets && (
          <Segmented
            label="First to … sets"
            value={opts.sets}
            onChange={set("sets")}
            options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))}
          />
        )}
        <Segmented
          label={opts.useSets ? "First to … legs per set" : "First to … legs"}
          value={opts.legs}
          onChange={set("legs")}
          options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }))}
        />

        <button
          type="button"
          onClick={start}
          disabled={picked.length === 0}
          className="mt-2 flex h-20 flex-col items-center justify-center rounded-2xl bg-double transition active:scale-[0.98] disabled:opacity-40"
        >
          <span className="font-display text-3xl leading-none font-bold">
            {picked.length === 0 ? "Pick a player" : `Start ${opts.startScore}`}
          </span>
          {picked.length > 0 && <span className="mt-1 text-sm text-chalk/80">{gameDetail("x01", config as never)}</span>}
        </button>
      </section>

      <Sheet open={guestOpen} onClose={() => setGuestOpen(false)} label="Add player">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <h2 className="font-display text-3xl font-bold">Add player</h2>
          <p className="text-dim">
            For friends without an account yet. Their games are saved under this name.
          </p>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-dim">Name</span>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              maxLength={40}
              autoFocus
              className="h-14 rounded-xl border border-wire bg-ink px-4 text-xl outline-none focus:border-chalk"
            />
          </label>
          {guestError && <p className="text-double">{guestError}</p>}
          <button
            type="submit"
            disabled={adding || !guestName.trim()}
            className="h-14 rounded-xl bg-chalk font-display text-xl font-bold text-ink disabled:opacity-40"
          >
            {adding ? "Adding…" : "Add player"}
          </button>
        </form>
      </Sheet>
    </div>
  );
}
