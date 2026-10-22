"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CameraButton, useCameraScoring } from "@/components/camera-scoring";
import { useMe } from "@/components/me";
import { Pad, TotalPad } from "@/components/pad";
import { SoloVideo } from "@/components/room-video";
import { Bone } from "@/components/skeleton";
import { Sheet } from "@/components/ui";
import { VisitTray } from "@/components/visit-tray";
import { type BotModel, botDart } from "@/lib/darts/bot";
import { isCheckoutPossible } from "@/lib/darts/checkout";
import { type Dart, visitTotal } from "@/lib/darts/board";
import type { GameEvent } from "@/lib/darts/engine";
import { gameDetail, gameTitle } from "@/lib/darts/labels";
import { type AnyState, type ConfigMap, type StateMap, replay } from "@/lib/darts/modes";
import { CRICKET_NUMBERS } from "@/lib/darts/modes/cricket";
import { type X01Config, doubleTarget, liveRemaining, visitTotalNeeds } from "@/lib/darts/modes/x01";
import { BOBS_TARGETS, checkoutTargets, doublesTargets } from "@/lib/darts/modes/practice";
import { type ActiveGame, type GamePlayer, gameStore, startGame, toPendingSave, useActiveGame } from "@/lib/game-store";
import { planStore, startPlanStep, usePlan } from "@/lib/plan-store";
import { syncPending } from "@/lib/sync";
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
  const me = useMe();
  // The preference lives in localStorage, which the server render can't touch; that render is the skeleton anyway.
  const [camera, setCamera] = useState<boolean>(() => typeof window !== "undefined" && gameStore.prefs("camera-scoring", false));
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
  // Always the same tree, so Play never remounts (and loses its state) when the profile arrives.
  return (
    <SoloVideo meId={me?.id ?? ""} enabled={!!me && camera}>
      <Play
        key={game.id}
        game={game}
        camera={
          me && {
            meId: me.id,
            enabled: camera,
            set: (on) => {
              setCamera(on);
              gameStore.setPref("camera-scoring", on);
            },
          }
        }
      />
    </SoloVideo>
  );
}

function CounterSkeleton() {
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

const BOT_PACE = 650;

type CameraSetting = { meId: string; enabled: boolean; set: (on: boolean) => void };

function Play({ game, camera }: { game: ActiveGame; camera: CameraSetting | null }) {
  const router = useRouter();
  const state = useMemo(() => rebuild(game), [game]);
  const [flash, setFlash] = useState<{ key: number; event: GameEvent } | null>(null);
  const [menu, setMenu] = useState(false);
  const [entry, setEntry] = useState<"darts" | "total">(() => (game.mode === "x01" ? gameStore.prefs("entry", "darts") : "darts"));
  const plan = usePlan();
  const inPlan = plan?.gameId === game.id ? plan : null;

  const throwDart = useCallback(
    (d: Dart) => {
      if (state.finished || game.ended) return;
      const next = { ...game, darts: [...game.darts, { ...d, t: Date.now() }] };
      gameStore.setActive(next);
      const ev = rebuild(next).event;
      if (ev && ev.type !== "hit" && ev.type !== "match") setFlash({ key: next.darts.length, event: ev });
    },
    [game, state.finished],
  );

  // A confirmed visit goes in as one write. Each dart still gets its own time stamp, and the
  // biggest call (bust, 180, leg) is flashed once.
  const throwDarts = useCallback(
    (ds: Dart[]) => {
      let next = game;
      let event: GameEvent | null = null;
      for (const d of ds) {
        if (rebuild(next).finished) break;
        next = { ...next, darts: [...next.darts, { ...d, t: Date.now() }] };
        const ev = rebuild(next).event;
        if (ev && ev.type !== "hit" && ev.type !== "match") event = ev;
      }
      const taken = next.darts.length - game.darts.length;
      if (!taken) return 0;
      gameStore.setActive(next);
      if (event) setFlash({ key: next.darts.length, event });
      return taken;
    },
    [game],
  );
  const botTurn = !state.finished && !game.ended && game.mode === "x01" && !!botAt(game, state.current);
  const cam = useCameraScoring(camera?.meId ?? "", throwDarts, !botTurn && !state.finished && !game.ended);

  // Undo goes back to the last dart a person threw, taking any bot visit with it.
  const undo = useCallback(() => {
    if (game.darts.length === 0) return;
    setFlash(null);
    let darts = game.darts.slice(0, -1);
    while (darts.length > 0) {
      const s = rebuild({ ...game, darts });
      if (s.finished || !botAt(game, s.current)) break;
      darts = darts.slice(0, -1);
    }
    gameStore.setActive({ ...game, ended: false, darts });
  }, [game]);

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

  function save() {
    gameStore.addPending(toPendingSave(game));
    void syncPending().then((r) => r.saved && router.refresh());
  }

  function finish() {
    if (game.darts.length > 0) save();
    gameStore.setActive(null);
    if (inPlan) planStore.clear();
    router.push("/");
  }

  function nextStep() {
    if (!inPlan) return;
    if (game.darts.length > 0) save();
    startPlanStep(inPlan.steps, inPlan.index + 1, inPlan.player);
  }
  function again() {
    if (game.darts.length > 0) save();
    planStore.clear();
    const players = game.kind === "match" ? [...game.players.slice(1), game.players[0]] : game.players;
    startGame({ kind: game.kind, mode: game.mode, config: freshConfig(game) as never, players });
  }

  const over = state.finished || !!game.ended;
  if (over) {
    return (
      <main className="safe-top safe-bottom flex flex-1 flex-col">
        <Summary
          game={game}
          state={state}
          stopped={!!game.ended && !state.finished}
          onAgain={again}
          onDone={finish}
          onUndo={undo}
          plan={inPlan ? { index: inPlan.index, steps: inPlan.steps.map((s) => s.title), onNext: nextStep } : null}
        />
      </main>
    );
  }

  const config = game.config as unknown as Record<string, unknown>;
  const { targets, quick } = aimFor(game, state);
  // Totals are entered a whole visit at a time, so the switch only works between visits.
  const visitOpen = state.open !== null && state.turns[state.open].darts.length > 0;
  // Camera darts are entered one by one, so the tray always uses the dart pad.
  const useTotals = game.mode === "x01" && entry === "total" && !visitOpen && !cam.active;

  function switchEntry(next: "darts" | "total") {
    setEntry(next);
    gameStore.setPref("entry", next);
  }

  return (
    <main className="locked safe-top safe-bottom fixed inset-0 flex flex-col gap-3 px-3 sm:px-4">
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
          <span className="ml-3 text-dim">{inPlan ? `Training ${inPlan.index + 1} of ${inPlan.steps.length}` : headerDetail(game, state)}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {camera && (
            <CameraButton
              enabled={camera.enabled}
              onEnabled={camera.set}
              status={cam.status}
              onReset={() => cam.send({ v: 1, kind: "reset" })}
            />
          )}
          {game.mode === "x01" && !cam.active ? (
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
            !camera && <span className="w-24" />
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-3 portrait:grid-rows-[minmax(0,1fr)_minmax(0,1.15fr)] landscape:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-h-0">
          <Board game={game} state={state} />
        </div>
        <div className="min-h-0">
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
            />
          ) : cam.active ? (
            <div className="flex h-full flex-col gap-2">
              <VisitTray tray={cam.tray} game={game} watching={!!cam.status?.calibrated} onConfirm={cam.confirm} />
              <div className="min-h-0 flex-1">
                <Pad
                  onDart={cam.tray.pad}
                  onUndo={() => cam.undo(undo)}
                  canUndo={cam.tray.darts.length > 0 || game.darts.length > 0}
                  targets={targets}
                  quick={quick}
                />
              </div>
            </div>
          ) : (
            <Pad onDart={throwDart} onUndo={undo} canUndo={game.darts.length > 0} targets={targets} quick={quick} />
          )}
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

export function Board({ game, state }: { game: ActiveGame; state: AnyState }) {
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
