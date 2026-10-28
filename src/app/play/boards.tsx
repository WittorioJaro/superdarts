"use client";

import { Avatar } from "@/components/ui";
import { type Dart, dartLabel, doubleLabel } from "@/lib/darts/board";
import { suggestCheckout } from "@/lib/darts/checkout";
import { type ScoredDart, type Turn, currentTurn, threeDartAverage } from "@/lib/darts/engine";
import type { ConfigMap, StateMap } from "@/lib/darts/modes";
import { CRICKET_NUMBERS, cricketMpr } from "@/lib/darts/modes/cricket";
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
            {d ? (d.v ? d.v.total : dartLabel(d)) : ""}
          </span>
        );
      })}
    </div>
  );
}

function Route({ route, big = false }: { route: Dart[] | null; big?: boolean }) {
  if (!route) return null;
  return (
    <p
      className={`flex items-center font-display font-bold text-brass ${big ? "gap-3 text-[clamp(2.5rem,7vh,4.5rem)] leading-none" : "gap-2 text-2xl"}`}
      aria-label={`Checkout: ${route.map(dartLabel).join(", ")}`}
    >
      {route.map((d, i) => (
        <span key={i} className={`rounded-lg border-brass/60 ${big ? "border-4 px-4 py-1.5" : "border-2 px-2.5 py-0.5"}`}>
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

export function X01Board({ state, config, players, big = false }: { state: StateMap["x01"]; config: X01Config; players: GamePlayer[]; big?: boolean }) {
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
              {active && route ? <Route route={route} big={big} /> : <span />}
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

/* ------------------------------------------------------------ Cricket */

function Marks({ n }: { n: number }) {
  if (n <= 0) return <span aria-label="No marks" className="block h-9 w-9" />;
  return (
    <svg aria-label={`${n} ${n === 1 ? "mark" : "marks"}`} viewBox="0 0 36 36" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round">
      <path d="M10 26 26 10" />
      {n >= 2 && <path d="M10 10l16 16" />}
      {n >= 3 && <circle cx="18" cy="18" r="15" strokeWidth="3.5" />}
    </svg>
  );
}

export function CricketBoard({ state, config, players }: { state: StateMap["cricket"]; config: ConfigMap["cricket"]; players: GamePlayer[] }) {
  const open = currentTurn(state);
  const solo = players.length === 1;
  const darts = state.turns.reduce((n, t) => n + t.darts.length, 0);
  const closedByAll = CRICKET_NUMBERS.map((_, i) => state.marks.every((m) => m[i] >= 3));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 rounded-3xl bg-felt p-4 sm:p-5">
      <div className="grid gap-2" style={{ gridTemplateColumns: `4.5rem repeat(${players.length}, minmax(0, 1fr))` }}>
        <span />
        {players.map((p, i) => {
          const active = state.current === i && !state.finished;
          return (
            <div key={p.id} className={`flex min-w-0 flex-col items-center gap-1 rounded-2xl px-2 py-2 ${active ? "bg-ink/50" : ""}`} aria-current={active ? "true" : undefined}>
              <span className="flex min-w-0 items-center gap-2">
                <Avatar name={p.name} color={p.color} url={p.avatarUrl} size={active ? 32 : 26} />
                <span className={`truncate font-semibold ${active ? "text-xl" : "text-dim"}`}>{p.name.split(" ")[0]}</span>
              </span>
              {solo ? (
                <span className="font-display text-4xl leading-none font-extrabold">{darts} <span className="text-lg font-semibold text-dim">darts</span></span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="font-display text-5xl leading-none font-extrabold">{state.points[i]}</span>
                  {config.legs > 1 && <LegPips won={state.legsWon[i]} target={config.legs} sets={null} />}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid min-h-0 flex-1 auto-rows-fr gap-1.5" style={{ gridTemplateColumns: `4.5rem repeat(${players.length}, minmax(0, 1fr))` }}>
        {CRICKET_NUMBERS.map((n, row) => (
          <div key={n} className={`contents ${closedByAll[row] ? "[&>*]:opacity-35" : ""}`}>
            <span className="flex items-center justify-center rounded-xl bg-ink/50 font-display text-3xl font-bold">{n === 25 ? "B" : n}</span>
            {players.map((p, i) => {
              const m = state.marks[i][row];
              return (
                <span
                  key={p.id}
                  className={`flex items-center justify-center rounded-xl ${m >= 3 ? "bg-treble/20 text-treble" : "bg-ink/30 text-chalk"} ${state.current === i && !state.finished ? "ring-2 ring-chalk/30 ring-inset" : ""}`}
                >
                  <Marks n={m} />
                </span>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex min-h-14 items-center justify-between gap-3">
        <DartSlots darts={open?.darts ?? []} />
        <span className="text-dim">
          MPR <span className="font-display text-xl font-semibold text-chalk">{fmtMpr(cricketMpr(state.turns.filter((t) => t.player === state.current)))}</span>
        </span>
      </div>
    </div>
  );
}

function fmtMpr(n: number | null) {
  return n === null ? "–" : n.toFixed(2);
}

/* ---------------------------------------------------------------- 121 */

export function OneTwentyOneBoard({ state, config }: { state: StateMap["onetwentyone"]; config: ConfigMap["onetwentyone"] }) {
  const darts = openDarts(state);
  const left = config.darts - state.used;
  const route = state.finished ? null : suggestCheckout(state.remaining, Math.min(3 - darts.length, left));
  const best = Math.max(0, ...state.results.filter((r) => r.success).map((r) => r.target));
  return (
    <Panel>
      <div className="flex items-start justify-between">
        <Big value={state.finished ? "Done" : state.remaining} label={state.finished ? "Finished" : `Target ${state.target}`} />
        <div className="flex flex-col items-end gap-3">
          <DartSlots darts={darts} />
          <span className="font-display text-xl text-dim">
            {left} {left === 1 ? "dart" : "darts"} left
          </span>
        </div>
      </div>
      <div className="min-h-10">{route ? <Route route={route} /> : !state.finished && <span className="text-dim">No finish from here with the darts left.</span>}</div>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Attempt" value={`${Math.min(state.attempt + 1, config.attempts)}/${config.attempts}`} />
        <Stat label="Checked out" value={state.results.filter((r) => r.success).length} />
        <Stat label="Highest" value={best || "–"} />
      </div>
      <Track
        items={[
          ...state.results.map((r) => ({ label: String(r.target), state: r.success ? ("done" as const) : ("miss" as const) })),
          ...(state.finished ? [] : [{ label: String(state.target), state: "now" as const }]),
        ]}
      />
    </Panel>
  );
}

/* ------------------------------------------------------ Target practice */

export function TargetBoard({ state, config }: { state: StateMap["target"]; config: ConfigMap["target"] }) {
  const target = config.targets[state.index];
  const total = config.targets.length * config.dartsPerTarget;
  const thrown = state.index * config.dartsPerTarget + state.thrown;
  const hits = state.hits.reduce((n, h) => n + h, 0);
  const hereHits = state.hits[state.index] ?? 0;
  return (
    <Panel>
      <div className="flex items-start justify-between">
        <Big value={target ? dartLabel(target) : "Done"} label="Aim at" tone="text-brass" />
        <DartSlots darts={openDarts(state)} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Hits" value={config.targets.length > 1 ? `${hereHits} here, ${hits} total` : hits} />
        <Stat label="Hit rate" value={thrown ? `${Math.round((hits / thrown) * 100)}%` : "–"} />
        <Stat label="Darts" value={`${thrown}/${total}`} />
      </div>
      <div className="flex flex-col gap-3">
        <div className="h-3 overflow-hidden rounded-full bg-ink/60" aria-hidden>
          <div className="h-full rounded-full bg-brass transition-[width]" style={{ width: `${(thrown / total) * 100}%` }} />
        </div>
        {config.targets.length > 1 && (
          <Track
            items={config.targets.map((t, i) => ({
              label: dartLabel(t),
              state: i < state.index ? ((state.hits[i] ?? 0) > 0 ? "done" : "miss") : i === state.index ? "now" : "todo",
            }))}
          />
        )}
      </div>
    </Panel>
  );
}
