"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Pad, TotalPad } from "@/components/pad";
import { Bone } from "@/components/skeleton";
import { Sheet } from "@/components/ui";
import { CallerButton } from "@/components/caller-settings";
import { GoodDarts } from "@/components/good-darts";
import { hush, say, useCallerSettings, warmCaller } from "@/lib/caller";
import { GOOD_DARTS, callsFor } from "@/lib/caller-calls";
import { type BotModel, botDart } from "@/lib/darts/bot";
import { isCheckoutPossible } from "@/lib/darts/checkout";
import { type Dart, visitTotal } from "@/lib/darts/board";
import type { GameEvent } from "@/lib/darts/engine";
import { gameDetail, gameTitle } from "@/lib/darts/labels";
import { type AnyState, type ConfigMap, type StateMap, replay } from "@/lib/darts/modes";
import { CRICKET_NUMBERS } from "@/lib/darts/modes/cricket";
import { type X01Config, doubleTarget, liveRemaining, visitTotalNeeds } from "@/lib/darts/modes/x01";
import { BOBS_TARGETS, checkoutTargets, doublesTargets } from "@/lib/darts/modes/practice";
import { type ActiveGame, type GamePlayer, type GameStore, gameStore, useActiveGame } from "@/lib/game-store";
import { SAVE_ERROR } from "@/lib/pub-table-types";
import { planStore, startPlanStep, usePlan } from "@/lib/plan-store";
import { type SyncResult, syncPending } from "@/lib/sync";
import {
  AroundBoard,
  BobsBoard,
  CheckoutBoard,
  CricketBoard,
  DoublesBoard,
  OneTwentyOneBoard,
  ScoringBoard,
  ShanghaiBoard,
  TargetBoard,
  X01Board,
} from "./boards";
import { Summary } from "./summary";

const noop = () => () => {};
function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}

export function Counter() {
  const game = useActiveGame();
  const hydrated = useHydrated();
  // The game lives in this device's storage, so the server can only draw the scorer's frame.
  if (!hydrated) return <CounterSkeleton />;
  if (!game) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="font-display text-5xl font-extrabold">No game in progress</h1>
        <p className="text-lg text-dim">Start a practice drill or a match from the home screen.</p>
        <Link href="/" className="rounded-2xl bg-chalk px-8 py-4 font-display text-2xl font-bold text-ink">
          Go home
        </Link>
      </main>
    );
  }
  return <Play key={game.id} game={game} />;
}

/** Also the route's loading screen, so starting a game goes straight to the scorer's frame. */
export function CounterSkeleton() {
  return (
    <main aria-busy className="locked safe-top safe-bottom fixed inset-0 flex flex-col gap-3 px-3 sm:px-4">
      <header className="h-12 shrink-0" />
      <div className="grid min-h-0 flex-1 gap-3 portrait:grid-rows-[minmax(0,1fr)_minmax(0,1.15fr)] landscape:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Bone className="h-full rounded-3xl" />
        <div className="grid h-full grid-cols-5 grid-rows-6 gap-2">
          <div className="col-span-5 grid grid-cols-2 gap-2">
            <Bone className="h-full rounded-2xl" />
            <Bone className="h-full rounded-2xl" />
          </div>
          {Array.from({ length: 24 }, (_, i) => (
            <Bone key={i} className={`h-full rounded-2xl ${i === 22 ? "col-span-2" : ""}`} delay={(i % 5) * 40} />
          ))}
        </div>
      </div>
    </main>
  );
}

function rebuild(game: ActiveGame): AnyState {
  return replay(game.mode, game.config as never, game.players.length, game.darts);
}

/** Bot opponents travel with the game on the device, model and all. */
type Player = GamePlayer & { bot?: BotModel };

function botAt(game: ActiveGame, i: number) {
  return (game.players[i] as Player | undefined)?.bot ?? null;
}

const NOTHING_UNDONE: { darts: Dart[]; at: Dart[] }[] = [];
const BOT_PACE = 650;
/** A finished game waits this long before saving, so a wrong last dart can still be undone. */
const AUTOSAVE_MS = 10_000;

/** Where a game lives and how it's saved. A pub table plays from its own store and returns to its own setup. */
export type PlayScope = { store: GameStore; sync: () => Promise<SyncResult>; table: boolean; big?: boolean };
const OWN_GAMES: PlayScope = { store: gameStore, sync: syncPending, table: false };

export function Play({ game, scope = OWN_GAMES }: { game: ActiveGame; scope?: PlayScope }) {
  const router = useRouter();
  const { store, table } = scope;
  const state = useMemo(() => rebuild(game), [game]);
  const [flash, setFlash] = useState<{ key: number; event: GameEvent } | null>(null);
  /** When a visit made 26: the dart count, so each one gets its own show, and who threw it. */
  const [goodDarts, setGoodDarts] = useState<{ key: number; player: string } | null>(null);
  const [menu, setMenu] = useState(false);
  const [entry, setEntry] = useState<"darts" | "total">(() => (game.mode === "x01" ? store.prefs("entry", "darts") : "darts"));
  const calling = useCallerSettings().on;
  const plan = usePlan();
  const inPlan = plan?.gameId === game.id ? plan : null;

  // Saves happen once per game. Undo is only offered until then, so the saved game never goes stale.
  // `queued` is this screen handing the game over; `game.saved` is the server having it, shown on every screen of a table.
  const [queued, setQueued] = useState<string | null>(null);
  const saved = !!game.saved || queued === saveKey(game);

  // What undo took away, newest last, so redo can put it back. Only valid while the game still ends where undo left it.
  const [undone, setUndone] = useState<{ darts: Dart[]; at: Dart[] }[]>([]);
  const redoable = useMemo(
    () => (undone.length > 0 && sameDarts(undone[undone.length - 1].at, game.darts) ? undone : NOTHING_UNDONE),
    [undone, game.darts],
  );

  const thrower = game.players[state.current]?.name ?? "";
  const throwDart = useCallback(
    (d: Dart) => {
      if (state.finished || game.ended || saved) return;
      setUndone([]);
      const next = { ...game, darts: [...game.darts, { ...d, t: Date.now() }] };
      store.setActive(next);
      const after = rebuild(next);
      const ev = after.event;
      if (ev && ev.type !== "hit" && ev.type !== "match") setFlash({ key: next.darts.length, event: ev });
      const calls = callsFor(game.mode, after as never, game.config as never);
      if (calls.includes(GOOD_DARTS)) setGoodDarts({ key: next.darts.length, player: thrower });
      say(calls);
    },
    [game, state.finished, thrower, store, saved],
  );

  // Undo goes back to the last dart a person threw, taking any bot visit with it.
  const undo = useCallback(() => {
    if (game.darts.length === 0 || saved) return;
    setFlash(null);
    setGoodDarts(null);
    hush();
    let darts = game.darts.slice(0, -1);
    while (darts.length > 0) {
      const s = rebuild({ ...game, darts });
      if (s.finished || !botAt(game, s.current)) break;
      darts = darts.slice(0, -1);
    }
    setUndone([...redoable, { darts: game.darts.slice(darts.length), at: darts }]);
    store.setActive({ ...game, ended: false, darts });
  }, [game, store, redoable, saved]);

  // Redo restores exactly what the last undo removed, timestamps and all.
  const redo = useCallback(() => {
    const last = redoable[redoable.length - 1];
    if (!last || saved) return;
    setFlash(null);
    setGoodDarts(null);
    hush();
    setUndone(redoable.slice(0, -1));
    store.setActive({ ...game, darts: [...game.darts, ...last.darts] });
  }, [game, store, redoable, saved]);

  // The caller opens each game, and its clips load in the background so the first score plays straight away.
  const fresh = game.darts.length === 0;
  useEffect(() => {
    if (!calling) return;
    if (fresh) say(["game-on"]);
    const stop = warmCaller();
    return () => {
      stop();
      hush();
    };
    // Only a new game or switching the caller on should say "Game on", not every dart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calling, game.id]);

  // A bot throws its darts one at a time, at a pace you can follow.
  const bot = !state.finished && !game.ended && game.mode === "x01" ? botAt(game, state.current) : null;
  useEffect(() => {
    if (!bot) return;
    const s = state as StateMap["x01"];
    const open = s.open === null ? 0 : s.turns[s.open].darts.length;
    const id = setTimeout(() => {
      const ctx = { remaining: liveRemaining(s, s.current), dartsLeft: (3 - open) as 1 | 2 | 3, out: (game.config as X01Config).out };
      throwDart(botDart(bot, ctx, Math.random));
    }, BOT_PACE);
    return () => clearTimeout(id);
  }, [bot, state, game.config, throwDart]);

  function save(g: ActiveGame = game) {
    if (g.saved || queued === saveKey(g) || g.darts.length === 0) return;
    setQueued(saveKey(g));
    store.queueSave(g);
    void scope.sync().then((r) => {
      if (r.saved) router.refresh();
      // A table closed from the phone, or past its 12 hours, rejects every save. The refresh shows why and
      // takes this computer back to the code screen, rather than offering rematches that can never be saved.
      if (table && r.errors.length) {
        store.setPref(SAVE_ERROR, r.errors[0]);
        router.refresh();
      }
    });
  }

  const over = state.finished || !!game.ended;
  // A finished game saves by itself after a moment. Undoing the last dart in that moment cancels it.
  const autosave = state.finished && !saved;
  useEffect(() => {
    if (!autosave) return;
    const id = setTimeout(() => save(), AUTOSAVE_MS);
    return () => clearTimeout(id);
    // `save` is a fresh closure each render; `autosave` and the game decide when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosave, game]);
  useEffect(() => {
    if (over && !table) router.prefetch("/");
  }, [over, router, table]);

  // The game is cleared only once this screen has gone, so "No game in progress" never flashes up on the way home.
  // A layout effect, so the home screen's resume banner never paints the old game either.
  const clearOnLeave = useRef(false);
  useLayoutEffect(
    () => () => {
      if (clearOnLeave.current) store.setActive(null);
    },
    [store],
  );
  function goHome(clear: boolean) {
    // A table's setup is the same page, so clearing the game is how it goes back.
    if (table) {
      if (clear) store.setActive(null);
      return;
    }
    clearOnLeave.current = clear;
    router.push("/");
  }

  function finish() {
    save();
    if (inPlan) planStore.clear();
    goHome(true);
  }

  function nextStep() {
    if (!inPlan) return;
    save();
    startPlanStep(inPlan.steps, inPlan.index + 1, inPlan.player);
  }
  function again() {
    save();
    planStore.clear();
    const players = game.kind === "match" ? [...game.players.slice(1), game.players[0]] : game.players;
    store.start({ kind: game.kind, mode: game.mode, ranked: game.ranked, config: freshConfig(game) as never, players });
  }

  if (over) {
    return (
      <main className="safe-top safe-bottom flex flex-1 flex-col">
        <Summary
          game={game}
          state={state}
          stopped={!!game.ended && !state.finished}
          onAgain={again}
          onDone={finish}
          doneLabel={table ? "Save and change game" : undefined}
          onUndo={undo}
          canUndo={!saved}
          note={saved ? "Saved to your stats." : state.finished ? "Saves in a few seconds. Undo now if the last dart was wrong." : null}
          plan={inPlan ? { index: inPlan.index, steps: inPlan.steps.map((s) => s.title), onNext: nextStep } : null}
        />
      </main>
    );
  }

  const config = game.config as unknown as Record<string, unknown>;
  const { targets, quick } = aimFor(game, state);
  // Totals are entered a whole visit at a time, so the switch only works between visits.
  const visitOpen = state.open !== null && state.turns[state.open].darts.length > 0;
  const useTotals = game.mode === "x01" && entry === "total" && !visitOpen;

  function switchEntry(next: "darts" | "total") {
    setEntry(next);
    store.setPref("entry", next);
  }

  return (
    <main className="locked safe-top safe-bottom fixed inset-0 flex flex-col gap-3 px-3 sm:px-4">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3">
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => setMenu(true)}
            className="flex h-12 items-center gap-2 rounded-xl px-3 text-dim hover:bg-cabinet hover:text-chalk"
          >
            <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
            <span className="font-medium">{game.kind === "match" ? "Leave" : "End"}</span>
          </button>
          <CallerButton className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl hover:bg-cabinet" />
        </div>
        <p className="truncate text-center">
          <span className="font-display text-2xl font-bold">{gameTitle(game.mode, config)}</span>
          <span className="ml-3 text-dim">{inPlan ? `Training ${inPlan.index + 1} of ${inPlan.steps.length}` : headerDetail(game, state)}</span>
        </p>
        {game.mode === "x01" ? (
          <div className="flex rounded-xl bg-cabinet p-1" role="group" aria-label="Enter scores as">
            {(["darts", "total"] as const).map((e) => (
              <button
                key={e}
                type="button"
                aria-pressed={entry === e}
                disabled={visitOpen && e === "total"}
                onClick={() => switchEntry(e)}
                className={`h-10 rounded-lg px-3 font-medium transition disabled:opacity-40 ${entry === e ? "bg-chalk text-ink" : "text-dim hover:text-chalk"}`}
              >
                {e === "darts" ? "Darts" : "Total"}
              </button>
            ))}
          </div>
        ) : (
          <span className="w-24" />
        )}
      </header>

      <div className="grid min-h-0 flex-1 gap-3 portrait:grid-cols-[minmax(0,1fr)] portrait:grid-rows-[minmax(0,1fr)_minmax(0,1.15fr)] landscape:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-h-0 min-w-0">
          <Board game={game} state={state} big={!!scope.big} />
        </div>
        <div className="min-h-0 min-w-0">
          {bot ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 rounded-3xl bg-cabinet p-6 text-center">
              <span className="font-display text-4xl font-bold">{game.players[state.current].name} is throwing…</span>
              <button type="button" onClick={undo} className="h-14 rounded-2xl bg-felt px-6 text-lg font-semibold text-dim hover:text-chalk">
                Undo your last dart
              </button>
            </div>
          ) : useTotals ? (
            <TotalPad
              onTotal={(total, opts) => {
                try {
                  throwDart(visitTotal(total, opts));
                } catch {
                  // The pad only offers possible combinations; anything else is ignored rather than crashing the game.
                }
              }}
              canFinish={(total, n) => isCheckoutPossible(total, n, (game.config as X01Config).out)}
              needs={(total) => visitTotalNeeds(state as StateMap["x01"], game.config as X01Config, total)}
              onUndo={undo}
              canUndo={game.darts.length > 0}
              onRedo={redo}
              canRedo={redoable.length > 0}
            />
          ) : (
            <Pad
              onDart={throwDart}
              onUndo={undo}
              canUndo={game.darts.length > 0}
              onRedo={redo}
              canRedo={redoable.length > 0}
              targets={targets}
              quick={quick}
            />
          )}
        </div>
      </div>

      {flash && <Flash key={flash.key} event={flash.event} game={game} />}
      {goodDarts && <GoodDarts key={goodDarts.key} player={goodDarts.player} />}

      <Sheet open={menu} onClose={() => setMenu(false)} label={game.kind === "match" ? "Leave match" : "End session"}>
        <LeaveMenu
          game={game}
          onClose={() => setMenu(false)}
          onPause={table ? null : () => goHome(false)}
          onEnd={() => {
            setMenu(false);
            const ended = { ...game, ended: true };
            store.setActive(ended);
            save(ended);
          }}
          onDiscard={() => {
            setMenu(false);
            goHome(true);
          }}
        />
      </Sheet>
    </main>
  );
}

/** `big` is for a pub table, read from the oche rather than at arm's length. */
export function Board({ game, state, big = false }: { game: ActiveGame; state: AnyState; big?: boolean }) {
  switch (game.mode) {
    case "x01":
      return <X01Board state={state as StateMap["x01"]} config={game.config as X01Config} players={game.players} big={big} />;
    case "scoring":
      return <ScoringBoard state={state as StateMap["scoring"]} config={game.config as ConfigMap["scoring"]} />;
    case "around":
      return <AroundBoard state={state as StateMap["around"]} config={game.config as ConfigMap["around"]} />;
    case "bobs27":
      return <BobsBoard state={state as StateMap["bobs27"]} />;
    case "doubles":
      return <DoublesBoard state={state as StateMap["doubles"]} config={game.config as ConfigMap["doubles"]} />;
    case "checkout":
      return <CheckoutBoard state={state as StateMap["checkout"]} config={game.config as ConfigMap["checkout"]} />;
    case "shanghai":
      return <ShanghaiBoard state={state as StateMap["shanghai"]} config={game.config as ConfigMap["shanghai"]} />;
    case "cricket":
      return <CricketBoard state={state as StateMap["cricket"]} config={game.config as ConfigMap["cricket"]} players={game.players} />;
    case "onetwentyone":
      return <OneTwentyOneBoard state={state as StateMap["onetwentyone"]} config={game.config as ConfigMap["onetwentyone"]} />;
    case "target":
      return <TargetBoard state={state as StateMap["target"]} config={game.config as ConfigMap["target"]} />;
  }
}

/** Which keys to outline, and the one-tap "hit" key for drills with a single target. */
export function aimFor(game: ActiveGame, state: AnyState): { targets: number[]; quick: Dart | null } {
  switch (game.mode) {
    case "x01": {
      const s = state as StateMap["x01"];
      const cfg = game.config as X01Config;
      const t = cfg.out === "single" ? null : doubleTarget(liveRemaining(s, s.current));
      return { targets: t ? [t] : [], quick: null };
    }
    case "around": {
      const s = state as StateMap["around"];
      const ring = (game.config as ConfigMap["around"]).ring;
      const t = s.targets[s.index];
      const m = ring === "double" ? 2 : ring === "treble" ? 3 : 1;
      return { targets: [t], quick: t === undefined ? null : { s: t, m } };
    }
    case "bobs27": {
      const t = BOBS_TARGETS[(state as StateMap["bobs27"]).round];
      return { targets: [t], quick: t ? { s: t, m: 2 } : null };
    }
    case "doubles": {
      const t = (game.config as ConfigMap["doubles"]).targets[(state as StateMap["doubles"]).index];
      return { targets: [t], quick: t ? { s: t, m: 2 } : null };
    }
    case "checkout": {
      const t = doubleTarget((state as StateMap["checkout"]).remaining);
      return { targets: t ? [t] : [], quick: null };
    }
    case "shanghai": {
      const t = (state as StateMap["shanghai"]).round + 1;
      return { targets: [t], quick: null };
    }
    case "cricket": {
      const s = state as StateMap["cricket"];
      return { targets: CRICKET_NUMBERS.filter((_, i) => s.marks[s.current][i] < 3), quick: null };
    }
    case "onetwentyone": {
      const t = doubleTarget((state as StateMap["onetwentyone"]).remaining);
      return { targets: t ? [t] : [], quick: null };
    }
    case "target": {
      const t = (game.config as ConfigMap["target"]).targets[(state as StateMap["target"]).index];
      return { targets: t ? [t.s] : [], quick: t ?? null };
    }
    default:
      return { targets: [], quick: null };
  }
}

export function headerDetail(game: ActiveGame, state: AnyState) {
  const config = game.config as unknown as Record<string, unknown>;
  if (game.mode === "x01" && game.kind === "match") {
    const s = state as StateMap["x01"];
    const sets = Number(config.sets) > 1 ? `Set ${s.set + 1}, ` : "";
    return `${sets}Leg ${s.legInSet + 1}. ${gameDetail(game.mode, config)}`;
  }
  if (game.mode === "cricket" && game.players.length > 1 && Number(config.legs) > 1) {
    return `Leg ${(state as StateMap["cricket"]).leg + 1}. ${gameDetail(game.mode, config)}`;
  }
  return gameDetail(game.mode, config);
}

/** A rematch or another go needs fresh random targets, not a replay of the same ones. */
function freshConfig(game: ActiveGame) {
  if (game.mode === "doubles") {
    const c = game.config as ConfigMap["doubles"];
    return { ...c, targets: doublesTargets(c.order) };
  }
  if (game.mode === "checkout") {
    const c = game.config as ConfigMap["checkout"];
    return { ...c, targets: checkoutTargets(c.min, c.max, c.targets.length) };
  }
  return game.config;
}

export function Flash({ event, game }: { event: GameEvent; game: ActiveGame }) {
  const name = game.players[event.player]?.name.split(" ")[0] ?? "";
  const content: Record<GameEvent["type"], { text: string; tone: string } | null> = {
    max: { text: game.mode === "shanghai" ? "Shanghai!" : game.mode === "cricket" ? "9 marks" : "180", tone: "text-brass" },
    bust: { text: "Bust", tone: "text-double" },
    leg: { text: game.players.length > 1 ? `Leg to ${name}` : "Leg won", tone: "text-chalk" },
    set: { text: `Set to ${name}`, tone: "text-brass" },
    out: { text: "Out", tone: "text-double" },
    hit: null,
    match: null,
  };
  const c = content[event.type];
  if (!c) return null;
  return (
    <div aria-live="assertive" className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center">
      <span
        className={`animate-pop rounded-[2.5rem] bg-ink/85 px-12 py-6 font-display text-[clamp(5rem,16vw,12rem)] leading-none font-extrabold tracking-tight shadow-2xl backdrop-blur ${c.tone}`}
      >
        {c.text}
      </span>
    </div>
  );
}

function LeaveMenu({
  game,
  onClose,
  onPause,
  onEnd,
  onDiscard,
}: {
  game: ActiveGame;
  onClose: () => void;
  onPause: (() => void) | null;
  onEnd: () => void;
  onDiscard: () => void;
}) {
  const btn = "h-16 w-full rounded-2xl font-display text-2xl font-bold transition active:scale-[0.98]";
  if (game.kind === "match") {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-3xl font-bold">Leave the match?</h2>
        <p className="mb-2 text-dim">
          {onPause ? "It stays on this device. Pick it up again from the home screen. " : ""}
          Ending it now saves every dart to the players&apos; stats without a winner. Abandoning throws it away.
        </p>
        {onPause && (
          <button type="button" onClick={onPause} className={`${btn} bg-chalk text-ink`}>
            Pause and go home
          </button>
        )}
        {game.darts.length > 0 && (
          <button type="button" onClick={onEnd} className={`${btn} ${onPause ? "bg-felt" : "bg-chalk text-ink"}`}>
            End and save stats
          </button>
        )}
        <button type="button" onClick={onDiscard} className={`${btn} border-2 border-double text-double`}>
          Abandon match
        </button>
        <button type="button" onClick={onClose} className={`${btn} text-dim`}>
          Keep playing
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-3xl font-bold">End this session?</h2>
      <p className="mb-2 text-dim">
        {game.darts.length > 0
          ? `You've thrown ${game.darts.length} darts. End now to save them to your stats.`
          : "You haven't thrown yet."}
      </p>
      {game.darts.length > 0 && (
        <button type="button" onClick={onEnd} className={`${btn} bg-chalk text-ink`}>
          End and save
        </button>
      )}
      <button type="button" onClick={onDiscard} className={`${btn} border-2 border-double text-double`}>
        Discard
      </button>
      <button type="button" onClick={onClose} className={`${btn} text-dim`}>
        Keep playing
      </button>
    </div>
  );
}

function sameDarts(a: Dart[], b: Dart[]) {
  return a.length === b.length && a.every((d, i) => d.t === b[i].t && d.s === b[i].s && d.m === b[i].m && d.v?.total === b[i].v?.total);
}

/** What a save handed over: this game, with these darts, ended or not. */
function saveKey(g: ActiveGame) {
  return `${g.id}:${g.darts.length}:${g.darts.at(-1)?.t ?? ""}:${!!g.ended}`;
}
