"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Pad } from "@/components/pad";
import { Sheet } from "@/components/ui";
import type { Dart } from "@/lib/darts/board";
import type { GameEvent } from "@/lib/darts/engine";
import { gameDetail, gameTitle } from "@/lib/darts/labels";
import { type AnyState, type ConfigMap, type StateMap, replay } from "@/lib/darts/modes";
import { type X01Config, doubleTarget, liveRemaining } from "@/lib/darts/modes/x01";
import { BOBS_TARGETS, checkoutTargets, doublesTargets } from "@/lib/darts/modes/practice";
import { type ActiveGame, gameStore, startGame, toPendingSave, useActiveGame } from "@/lib/game-store";
import { syncPending } from "@/lib/sync";
import {
  AroundBoard,
  BobsBoard,
  CheckoutBoard,
  DoublesBoard,
  ScoringBoard,
  ShanghaiBoard,
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
  if (!hydrated) return null;
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

function rebuild(game: ActiveGame): AnyState {
  return replay(game.mode, game.config as never, game.players.length, game.darts);
}

function Play({ game }: { game: ActiveGame }) {
  const router = useRouter();
  const state = useMemo(() => rebuild(game), [game]);
  const [flash, setFlash] = useState<{ key: number; event: GameEvent } | null>(null);
  const [menu, setMenu] = useState(false);

  const throwDart = useCallback(
    (d: Dart) => {
      if (state.finished || game.ended) return;
      const next = { ...game, darts: [...game.darts, d] };
      gameStore.setActive(next);
      const ev = rebuild(next).event;
      if (ev && ev.type !== "hit" && ev.type !== "match") setFlash({ key: next.darts.length, event: ev });
    },
    [game, state.finished],
  );

  const undo = useCallback(() => {
    if (game.darts.length === 0) return;
    setFlash(null);
    gameStore.setActive({ ...game, ended: false, darts: game.darts.slice(0, -1) });
  }, [game]);

  function save() {
    gameStore.addPending(toPendingSave(game));
    void syncPending().then(() => router.refresh());
  }

  function finish() {
    if (game.darts.length > 0) save();
    gameStore.setActive(null);
    router.push("/");
  }

  function again() {
    if (game.darts.length > 0) save();
    const players = game.kind === "match" ? [...game.players.slice(1), game.players[0]] : game.players;
    startGame({ kind: game.kind, mode: game.mode, config: freshConfig(game) as never, players });
  }

  const over = state.finished || !!game.ended;
  if (over) {
    return (
      <main className="safe-top safe-bottom flex flex-1 flex-col">
        <Summary game={game} state={state} stopped={!!game.ended && !state.finished} onAgain={again} onDone={finish} onUndo={undo} />
      </main>
    );
  }

  const config = game.config as unknown as Record<string, unknown>;
  const { targets, quick } = aimFor(game, state);

  return (
    <main className="safe-top safe-bottom fixed inset-0 flex flex-col gap-3 px-3 sm:px-4">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3">
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
        <p className="truncate text-center">
          <span className="font-display text-2xl font-bold">{gameTitle(game.mode, config)}</span>
          <span className="ml-3 text-dim">{headerDetail(game, state)}</span>
        </p>
        <span className="w-24" />
      </header>

      <div className="grid min-h-0 flex-1 gap-3 portrait:grid-rows-[minmax(0,1fr)_minmax(0,1.15fr)] landscape:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-h-0">
          <Board game={game} state={state} />
        </div>
        <div className="min-h-0">
          <Pad onDart={throwDart} onUndo={undo} canUndo={game.darts.length > 0} targets={targets} quick={quick} />
        </div>
      </div>

      {flash && <Flash key={flash.key} event={flash.event} game={game} />}

      <Sheet open={menu} onClose={() => setMenu(false)} label={game.kind === "match" ? "Leave match" : "End session"}>
        <LeaveMenu
          game={game}
          onClose={() => setMenu(false)}
          onPause={() => router.push("/")}
          onEnd={() => {
            setMenu(false);
            gameStore.setActive({ ...game, ended: true });
          }}
          onDiscard={() => {
            gameStore.setActive(null);
            router.push("/");
          }}
        />
      </Sheet>
    </main>
  );
}

function Board({ game, state }: { game: ActiveGame; state: AnyState }) {
  switch (game.mode) {
    case "x01":
      return <X01Board state={state as StateMap["x01"]} config={game.config as X01Config} players={game.players} />;
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
  }
}

/** Which keys to outline, and the one-tap "hit" key for drills with a single target. */
function aimFor(game: ActiveGame, state: AnyState): { targets: number[]; quick: Dart | null } {
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
    default:
      return { targets: [], quick: null };
  }
}

function headerDetail(game: ActiveGame, state: AnyState) {
  const config = game.config as unknown as Record<string, unknown>;
  if (game.mode === "x01" && game.kind === "match") {
    const s = state as StateMap["x01"];
    const sets = Number(config.sets) > 1 ? `Set ${s.set + 1}, ` : "";
    return `${sets}Leg ${s.legInSet + 1}. ${gameDetail(game.mode, config)}`;
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

function Flash({ event, game }: { event: GameEvent; game: ActiveGame }) {
  const name = game.players[event.player]?.name.split(" ")[0] ?? "";
  const content: Record<GameEvent["type"], { text: string; tone: string } | null> = {
    max: { text: game.mode === "shanghai" ? "Shanghai!" : "180", tone: "text-brass" },
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
  onPause: () => void;
  onEnd: () => void;
  onDiscard: () => void;
}) {
  const btn = "h-16 w-full rounded-2xl font-display text-2xl font-bold transition active:scale-[0.98]";
  if (game.kind === "match") {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-3xl font-bold">Leave the match?</h2>
        <p className="mb-2 text-dim">
          It stays on this device. Pick it up again from the home screen. Only finished matches count towards stats.
        </p>
        <button type="button" onClick={onPause} className={`${btn} bg-chalk text-ink`}>
          Pause and go home
        </button>
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
