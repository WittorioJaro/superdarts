"use client";

import { Avatar } from "@/components/ui";
import { type Dart, dartLabel, doubleLabel } from "@/lib/darts/board";
import { suggestCheckout } from "@/lib/darts/checkout";
import { type ScoredDart, type Turn, currentTurn, threeDartAverage } from "@/lib/darts/engine";
import type { ConfigMap, StateMap } from "@/lib/darts/modes";
import { BOBS_TARGETS } from "@/lib/darts/modes/practice";
import { type X01Config, liveRemaining } from "@/lib/darts/modes/x01";
import { fmtAvg } from "@/lib/darts/stats";
import type { GamePlayer } from "@/lib/game-store";

export function DartSlots({ darts, size = "lg" }: { darts: ScoredDart[]; size?: "lg" | "sm" }) {
  const box = size === "lg" ? "h-14 min-w-20 text-3xl" : "h-10 min-w-14 text-xl";
  return (
    <div className="flex gap-2">
      {[0, 1, 2].map((i) => {
        const d = darts[i];
        return (
          <span
            key={i}
            className={`flex items-center justify-center rounded-xl px-2 font-display font-bold ${box} ${
              d
                ? d.m === 3
                  ? "bg-treble/25 text-chalk"
                  : d.m === 2
                    ? "bg-double/25 text-chalk"
                    : d.m === 0
                      ? "bg-ink/60 text-dim"
                      : "bg-ink/60 text-chalk"
                : "border-2 border-dashed border-wire"
            }`}
          >
            {d ? dartLabel(d) : ""}
          </span>
        );
      })}
    </div>
  );
}

function Route({ route }: { route: Dart[] | null }) {
  if (!route) return null;
  return (
    <p className="flex items-center gap-2 font-display text-2xl font-bold text-brass" aria-label={`Checkout: ${route.map(dartLabel).join(", ")}`}>
      {route.map((d, i) => (
        <span key={i} className="rounded-lg border-2 border-brass/60 px-2.5 py-0.5">
          {dartLabel(d)}
        </span>
      ))}
    </p>
  );
}

function lastClosedTurn(turns: Turn[], player: number, open: number | null) {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (i !== open && turns[i].player === player) return turns[i];
  }
  return null;
}

/* ----------------------------------------------------------------- X01 */

export function X01Board({ state, config, players }: { state: StateMap["x01"]; config: X01Config; players: GamePlayer[] }) {
  const open = currentTurn(state);
  const many = players.length > 2;

  return (
    <div className="flex h-full flex-col gap-3">
      {players.map((p, i) => {
        const active = state.current === i && !state.finished;
        const remaining = liveRemaining(state, i);
        const turn = open && open.player === i ? open : null;
        const last = lastClosedTurn(state.turns, i, state.open);
        const dartsLeft = 3 - (turn?.darts.length ?? 0);
        const route = active && config.out !== "single" && remaining <= 170 ? suggestCheckout(remaining, dartsLeft, config.out) : null;
        const avg = threeDartAverage(state.turns.filter((t) => t.player === i));
        const legs = state.legsWon[i];

        return (
          <section
            key={p.id}
            aria-current={active ? "true" : undefined}
            aria-label={p.name}
            className={`relative flex min-h-0 flex-col justify-between overflow-hidden rounded-3xl transition-[flex-grow,background-color] duration-300 ${
              active ? "flex-[1.8] bg-felt p-5" : `flex-1 bg-cabinet ${many ? "px-5 py-3" : "p-5"}`
            }`}
          >
            <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: p.color }} />
            <div className="flex items-center gap-3">
              <Avatar name={p.name} color={p.color} url={p.avatarUrl} size={active ? 40 : 30} />
              <h2 className={`min-w-0 flex-1 truncate font-semibold ${active ? "text-2xl" : "text-xl text-dim"}`}>{p.name}</h2>
              <LegPips won={legs} target={config.legs} sets={config.sets > 1 ? state.setsWon[i] : null} />
            </div>

            <div className="flex items-end justify-between gap-4">
              <span
                className={`font-display leading-[0.82] font-extrabold tracking-tight ${
                  active ? "text-[clamp(5rem,13vh,10rem)]" : many ? "text-6xl text-chalk/80" : "text-8xl text-chalk/80"
                }`}
              >
                {remaining}
              </span>
              <div className="flex flex-col items-end gap-2 pb-1">
                {active ? (
                  <>
                    <DartSlots darts={turn?.darts ?? []} />
                    <span className="font-display text-xl text-dim">
                      {turn ? `${turn.points} this visit` : " "}
                    </span>
                  </>
                ) : (
                  <span className="text-right text-dim">
                    {last && (
                      <span className="block font-display text-2xl font-semibold text-chalk/80">
                        {last.bust ? "Bust" : last.points}
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>

            <div className="flex min-h-9 items-center justify-between gap-3">
              {active && route ? <Route route={route} /> : <span />}
              <span className="text-dim">
                Avg <span className="font-display text-xl font-semibold text-chalk">{fmtAvg(avg)}</span>
              </span>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function LegPips({ won, target, sets }: { won: number; target: number; sets: number | null }) {
  return (
    <span className="flex items-center gap-2" aria-label={`${sets !== null ? `${sets} sets, ` : ""}${won} legs`}>
      {sets !== null && (
        <span className="rounded-md bg-chalk px-2 font-display text-lg font-bold text-ink">{sets}</span>
      )}
      {target <= 7 ? (
        <span className="flex gap-1">
          {Array.from({ length: target }, (_, k) => (
            <span key={k} className={`h-3 w-3 rounded-full ${k < won ? "bg-brass" : "bg-wire"}`} />
          ))}
        </span>
      ) : (
        <span className="font-display text-xl font-bold text-brass">{won}</span>
      )}
    </span>
  );
}

/* ---------------------------------------------------------- Practice */

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col justify-between gap-4 rounded-3xl bg-felt p-6">{children}</div>;
}

function Big({ value, label, tone }: { value: React.ReactNode; label: string; tone?: string }) {
  return (
    <div>
      <div className="text-lg text-dim">{label}</div>
      <div className={`font-display text-[clamp(5rem,15vh,11rem)] leading-[0.85] font-extrabold tracking-tight ${tone ?? ""}`}>
        {value}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm text-dim">{label}</div>
      <div className="font-display text-3xl font-bold">{value}</div>
    </div>
  );
}

function Track({ items }: { items: { label: string; state: "done" | "miss" | "now" | "todo" }[] }) {
  return (
    <ol className="flex flex-wrap gap-1.5">
      {items.map((it, i) => (
        <li
          key={i}
          className={`flex h-9 min-w-9 items-center justify-center rounded-lg px-1.5 font-display text-base font-bold ${
            it.state === "done"
              ? "bg-treble text-ink"
              : it.state === "miss"
                ? "bg-double/30 text-chalk/70"
                : it.state === "now"
                  ? "bg-brass text-ink"
                  : "bg-ink/50 text-dim"
          }`}
        >
          {it.label}
        </li>
      ))}
    </ol>
  );
}

function openDarts(state: { turns: Turn[]; open: number | null }) {
  return state.open === null ? [] : state.turns[state.open].darts;
}

export function ScoringBoard({ state, config }: { state: StateMap["scoring"]; config: ConfigMap["scoring"] }) {
  const darts = openDarts(state);
  const visitPoints = darts.reduce((n, d) => n + d.score, 0);
  const done = state.turns.filter((_, i) => i !== state.open);
  const recent = done.slice(-8).reverse();
  return (
    <Panel>
      <div className="flex items-start justify-between">
        <Big value={visitPoints} label="This visit" />
        <DartSlots darts={darts} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Average" value={fmtAvg(threeDartAverage(state.turns))} />
        <Stat label="Visits" value={config.rounds ? `${done.length}/${config.rounds}` : done.length} />
        <Stat label="Best visit" value={Math.max(0, ...done.map((t) => t.points))} />
      </div>
      <div className="flex min-h-10 flex-wrap gap-2">
        {recent.map((t, i) => (
          <span key={i} className={`rounded-lg bg-ink/50 px-3 py-1 font-display text-xl font-semibold ${i === 0 ? "text-chalk" : "text-dim"}`}>
            {t.points}
          </span>
        ))}
      </div>
    </Panel>
  );
}

export function AroundBoard({ state, config }: { state: StateMap["around"]; config: ConfigMap["around"] }) {
  const target = state.targets[state.index];
  const prefix = config.ring === "double" ? "D" : config.ring === "treble" ? "T" : "";
  const darts = state.turns.reduce((n, t) => n + t.darts.length, 0);
  const hits = state.turns.reduce((n, t) => n + t.points, 0);
  return (
    <Panel>
      <div className="flex items-start justify-between">
        <Big value={target === undefined ? "Done" : target === 25 ? (config.ring === "double" ? "Bull" : "25") : `${prefix}${target}`} label="Aim at" tone="text-brass" />
        <DartSlots darts={openDarts(state)} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Darts" value={darts} />
        <Stat label="Hit rate" value={darts ? `${Math.round((hits / darts) * 100)}%` : "–"} />
        <Stat label="To go" value={state.targets.length - state.index} />
      </div>
      <Track
        items={state.targets.map((t, i) => ({
          label: t === 25 ? "B" : String(t),
          state: i < state.index ? "done" : i === state.index ? "now" : "todo",
        }))}
      />
    </Panel>
  );
}

export function BobsBoard({ state }: { state: StateMap["bobs27"] }) {
  const target = BOBS_TARGETS[state.round];
  return (
    <Panel>
      <div className="flex items-start justify-between">
        <Big value={state.score} label="Score" tone={state.score < 27 ? "text-double" : ""} />
        <div className="flex flex-col items-end gap-3">
          <span className="font-display text-6xl font-extrabold text-brass">{target ? doubleLabel(target) : "Done"}</span>
          <DartSlots darts={openDarts(state)} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Round" value={`${Math.min(state.round + 1, 21)}/21`} />
        <Stat label="Worth" value={target ? target * 2 : "–"} />
        <Stat label="Doubles hit" value={state.turns.reduce((n, t) => n + t.darts.filter((d) => d.hit).length, 0)} />
      </div>
      <Track
        items={BOBS_TARGETS.map((t, i) => ({
          label: t === 25 ? "B" : String(t),
          state: i < state.round ? (state.turns[i]?.points > 0 ? "done" : "miss") : i === state.round ? "now" : "todo",
        }))}
      />
    </Panel>
  );
}

export function DoublesBoard({ state, config }: { state: StateMap["doubles"]; config: ConfigMap["doubles"] }) {
  const target = config.targets[state.index];
  const darts = state.turns.reduce((n, t) => n + t.darts.length, 0);
  const hits = state.turns.reduce((n, t) => n + t.points, 0);
  return (
    <Panel>
      <div className="flex items-start justify-between">
        <Big value={target ? doubleLabel(target) : "Done"} label="Aim at" tone="text-brass" />
        <DartSlots darts={openDarts(state)} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Hits" value={hits} />
        <Stat label="Hit rate" value={darts ? `${Math.round((hits / darts) * 100)}%` : "–"} />
        <Stat label="Double" value={`${Math.min(state.index + 1, config.targets.length)}/${config.targets.length}`} />
      </div>
      <Track
        items={config.targets.map((t, i) => ({
          label: t === 25 ? "B" : String(t),
          state: i < state.index ? (state.turns[i]?.points > 0 ? "done" : "miss") : i === state.index ? "now" : "todo",
        }))}
      />
    </Panel>
  );
}

export function CheckoutBoard({ state, config }: { state: StateMap["checkout"]; config: ConfigMap["checkout"] }) {
  const darts = openDarts(state);
  const left = config.darts - state.used;
  const route = state.finished ? null : suggestCheckout(state.remaining, Math.min(3 - darts.length, left));
  return (
    <Panel>
      <div className="flex items-start justify-between">
        <Big value={state.finished ? "Done" : state.remaining} label={`Finish ${Math.min(state.attempt + 1, config.targets.length)} of ${config.targets.length}`} />
        <div className="flex flex-col items-end gap-3">
          <DartSlots darts={darts} />
          <span className="font-display text-xl text-dim">
            {left} {left === 1 ? "dart" : "darts"} left
          </span>
        </div>
      </div>
      <div className="min-h-10">{route ? <Route route={route} /> : !state.finished && <span className="text-dim">No finish from here with the darts left.</span>}</div>
      <Track
        items={config.targets.map((t, i) => ({
          label: String(t),
          state: i < state.results.length ? (state.results[i] ? "done" : "miss") : i === state.attempt ? "now" : "todo",
        }))}
      />
    </Panel>
  );
}

export function ShanghaiBoard({ state, config }: { state: StateMap["shanghai"]; config: ConfigMap["shanghai"] }) {
  const target = state.round + 1;
  return (
    <Panel>
      <div className="flex items-start justify-between">
        <Big value={state.score} label="Score" />
        <div className="flex flex-col items-end gap-3">
          <span className="font-display text-6xl font-extrabold text-brass">{state.finished ? "Done" : target}</span>
          <DartSlots darts={openDarts(state)} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Round" value={`${Math.min(target, config.rounds)}/${config.rounds}`} />
        <Stat label="Shanghais" value={state.shanghais} />
        <Stat label="Best round" value={Math.max(0, ...state.turns.map((t) => t.points))} />
      </div>
      <Track
        items={Array.from({ length: config.rounds }, (_, i) => ({
          label: String(i + 1),
          state: i < state.round ? (state.turns[i]?.points > 0 ? "done" : "miss") : i === state.round ? "now" : "todo",
        }))}
      />
    </Panel>
  );
}
