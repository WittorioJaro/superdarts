"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { addGuest, ensureBot } from "@/app/actions";
import { DEFAULT_OPTS, type GameOpts, GameOptions, cricketConfig, x01Config } from "@/components/game-options";
import { Bone } from "@/components/skeleton";
import { Avatar, Sheet } from "@/components/ui";
import type { BotModel } from "@/lib/darts/bot";
import { gameDetail } from "@/lib/darts/labels";
import { type GamePlayer, gameStore, startGame } from "@/lib/game-store";

type Opts = GameOpts;
const DEFAULTS = DEFAULT_OPTS;

type Lineup = GamePlayer & { bot?: BotModel };

const BOT_LEVELS = [40, 50, 60, 70, 80, 90];

/** Midnight UTC, so the same ghost asked for twice in a day is the same bot. */
function dayIso(daysAgo: number) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString();
}

export function MatchSetup({ players: initial, meId }: { players: GamePlayer[]; meId: string }) {
  const router = useRouter();
  // The counter has no server data, so it can be fully loaded before Start is tapped.
  useEffect(() => router.prefetch("/play"), [router]);
  const [players, setPlayers] = useState<Lineup[]>(initial);
  const [picked, setPicked] = useState<string[]>([meId]);
  const [opts, setOpts] = useState<Opts>(DEFAULTS);
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestError, setGuestError] = useState<string | null>(null);
  const [adding, startAdding] = useTransition();
  const [botOpen, setBotOpen] = useState(false);
  const [botError, setBotError] = useState<string | null>(null);

  // Restore the last line-up and format, so a rematch next week is one tap.
  useEffect(() => {
    const saved = gameStore.prefs<{ opts?: Opts; picked?: string[] }>("match", {});
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved.opts) setOpts({ ...DEFAULTS, ...saved.opts });
    const known = (saved.picked ?? []).filter((id) => initial.some((p) => p.id === id));
    if (known.length) setPicked(known);
  }, [initial]);

  function addBot(profile: Parameters<typeof ensureBot>[0]) {
    startAdding(async () => {
      try {
        const bot = await ensureBot(profile);
        setPlayers((ps) => [...ps.filter((p) => p.id !== bot.id), { id: bot.id, name: bot.name, color: bot.color, avatarUrl: null, bot: bot.model }]);
        setPicked((p) => (p.includes(bot.id) ? p : [...p, bot.id]));
        setOpts((o) => ({ ...o, game: "x01" }));
        setBotError(null);
        setBotOpen(false);
      } catch {
        setBotError("Couldn't set up that opponent. Check your connection and try again.");
      }
    });
  }

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

  const config = x01Config(opts);
  const cricket = cricketConfig(opts);
  const lineup = picked.map((id) => players.find((p) => p.id === id)!).filter(Boolean);
  const hasBot = lineup.some((p) => p.bot);
  // Ratings are for 501 between real players only.
  const canRank = opts.game === "x01" && opts.startScore === 501 && lineup.length >= 2 && !hasBot;

  function start() {
    const current = gameStore.active();
    if (current && current.darts.length > 0 && !window.confirm("Starting a new match ends the game in progress. Start anyway?")) return;
    // Bots are added fresh each time, so only people are remembered.
    gameStore.setPref("match", { opts, picked: picked.filter((id) => !players.find((p) => p.id === id)?.bot) });
    const ranked = canRank && opts.ranked;
    if (opts.game === "cricket") startGame({ kind: "match", mode: "cricket", config: cricket, players: lineup, ranked: false });
    else startGame({ kind: "match", mode: "x01", config, players: lineup, ranked });
    router.push("/play");
  }

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
          <li>
            <button
              type="button"
              onClick={() => setBotOpen(true)}
              className="flex h-full min-h-[68px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-wire text-dim transition hover:border-dim hover:text-chalk"
            >
              <span className="text-2xl leading-none">+</span> Play a bot
            </button>
          </li>
        </ul>
      </section>

      <section aria-labelledby="format" className="flex flex-col gap-6">
        <h2 id="format" className="font-display text-2xl font-bold">
          Game
        </h2>
        <GameOptions
          opts={opts}
          onChange={setOpts}
          allowCricket={!hasBot}
          canRank={canRank}
          rankHint={canRank ? "Counts towards everyone's 501 rating." : hasBot ? "Games against bots don't change ratings." : "Ratings are for 501 with two or more players."}
        />

        <button
          type="button"
          onClick={start}
          disabled={picked.length === 0}
          className="mt-2 flex h-20 flex-col items-center justify-center rounded-2xl bg-double transition active:scale-[0.98] disabled:opacity-40"
        >
          <span className="font-display text-3xl leading-none font-bold">
            {picked.length === 0 ? "Pick a player" : `Start ${opts.game === "cricket" ? "Cricket" : opts.startScore}`}
          </span>
          {picked.length > 0 && (
            <span className="mt-1 text-sm text-chalk/80">
              {opts.game === "cricket" ? gameDetail("cricket", cricket as never) : gameDetail("x01", config as never)}
            </span>
          )}
        </button>
      </section>

      <Sheet open={botOpen} onClose={() => setBotOpen(false)} label="Play a bot">
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="font-display text-3xl font-bold">Play a bot</h2>
            <p className="text-dim">It throws its own darts. Games against a bot count towards your stats but not your rating.</p>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-dim">Your past self</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { label: "You, last 30 days", days: 30 },
                { label: "You, last 90 days", days: 90 },
              ].map((g) => (
                <button
                  key={g.days}
                  type="button"
                  disabled={adding}
                  onClick={() => addBot({ kind: "ghost", of: meId, from: dayIso(g.days), to: dayIso(-1) })}
                  className="h-14 rounded-xl bg-felt px-4 text-left text-lg font-semibold hover:bg-wire disabled:opacity-40"
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-dim">Bot with a set average</span>
            <div className="grid grid-cols-3 gap-2">
              {BOT_LEVELS.map((avg) => (
                <button
                  key={avg}
                  type="button"
                  disabled={adding}
                  onClick={() => addBot({ kind: "level", average: avg })}
                  className="h-14 rounded-xl bg-felt font-display text-2xl font-bold hover:bg-wire disabled:opacity-40"
                >
                  {avg}
                </button>
              ))}
            </div>
          </div>
          {botError && <p className="text-double">{botError}</p>}
        </div>
      </Sheet>

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
            For a friend without an account. They play under this name for now but won&apos;t join the player list. To stay on it, they sign in with Google.
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

/** The page as it first draws: the real game options, placeholders where the players go. */
export function MatchSetupSkeleton() {
  return (
    <div aria-hidden className="pointer-events-none grid gap-8 pb-6 lg:grid-cols-[1.1fr_1fr]">
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl font-bold">Who&apos;s playing</h2>
          <span className="text-sm text-dim">Tap in throwing order</span>
        </div>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center gap-3 rounded-2xl border-2 border-transparent bg-cabinet p-3">
              <Bone className="h-11 w-11 rounded-full bg-felt" delay={i * 100} />
              <Bone className="h-4 w-28 rounded-md bg-felt" delay={i * 100} />
            </li>
          ))}
          {["Add player", "Play a bot"].map((label) => (
            <li key={label} className="flex min-h-[68px] items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-wire text-dim">
              <span className="text-2xl leading-none">+</span> {label}
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-6">
        <h2 className="font-display text-2xl font-bold">Game</h2>
        <GameOptions opts={DEFAULTS} onChange={() => {}} allowCricket canRank={false} rankHint="Ratings are for 501 with two or more players." />
        <Bone className="mt-2 h-20 rounded-2xl bg-double" />
      </section>
    </div>
  );
}
