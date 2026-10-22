"use client";

import { Avatar } from "@/components/ui";
import { dartLabel, doubleLabel } from "@/lib/darts/board";
import { type BaseState, turnDarts } from "@/lib/darts/engine";
import { gameDetail, gameTitle } from "@/lib/darts/labels";
import { type AnyState, MODES, type StateMap, results } from "@/lib/darts/modes";
import { cricketMpr } from "@/lib/darts/modes/cricket";
import { BOBS_TARGETS } from "@/lib/darts/modes/practice";
import { type ScoringStats, fmtAvg, fmtPct, scoringStats } from "@/lib/darts/stats";
import type { ActiveGame } from "@/lib/game-store";

export function playerStats(state: BaseState, player: number): ScoringStats {
  const mine = state.turns.filter((t) => t.player === player);
  return scoringStats(
    mine.map((t) => ({
      points: t.points,
      darts: turnDarts(t),
      bust: t.bust,
      checkout: t.checkout,
      startScore: t.startScore,
      visit: t.visit,
      legKey: String(t.leg),
    })),
    mine.reduce((n, t) => n + t.darts.reduce((k, d) => k + (d.v ? d.v.atDouble : d.atDouble ? 1 : 0), 0), 0),
  );
}

export function Summary({
  game,
  state,
  stopped,
  onAgain,
  onDone,
  onUndo,
  canUndo = true,
  plan,
  doneLabel = "Go to home",
  againLabel,
  note,
}: {
  game: ActiveGame;
  state: AnyState;
  stopped: boolean;
  onAgain: () => void;
  onDone: () => void;
  onUndo: () => void;
  canUndo?: boolean;
  doneLabel?: string;
  againLabel?: string;
  /** A line above the buttons, e.g. who else is still looking at this result. */
  note?: string | null;
  /** Set when this game is one step of a training plan. */
  plan: { index: number; steps: string[]; onNext: () => void } | null;
}) {
  const config = game.config as unknown as Record<string, unknown>;
  const res = results(game.mode, state as never, game.config as never);
  const info = MODES[game.mode];
  const isMatch = game.kind === "match";
  const winner = state.winner !== null ? game.players[state.winner] : null;

  let headline: string;
  let sub: string;
  if (isMatch && winner) {
    headline = `${winner.name.split(" ")[0]} wins`;
    sub = game.players.map((_, i) => (Number(config.sets) > 1 ? res[i].setsWon : res[i].legsWon)).join("–");
    const points = (state as StateMap["cricket"]).points;
    if (game.mode === "cricket" && Number(config.legs) === 1 && points?.some((p) => p > 0)) sub = `${sub}, ${points.join("–")} on points`;
  } else {
    headline = practiceHeadline(game, state);
    sub = `${gameTitle(game.mode, config)}, ${gameDetail(game.mode, config).toLowerCase()}`;
  }

  const showScoring = info.scoring;
  const stats = game.players.map((_, i) => playerStats(state, i));
  const rows: { label: string; value: (s: ScoringStats) => string; x01?: boolean }[] = [
    { label: "3-dart average", value: (s) => fmtAvg(s.average) },
    { label: "First 9 average", value: (s) => fmtAvg(s.first9), x01: true },
    { label: "Checkout rate", value: (s) => (s.checkoutAttempts ? `${fmtPct(s.checkoutPct)} (${s.checkouts}/${s.checkoutAttempts})` : "–"), x01: true },
    { label: "Highest checkout", value: (s) => (s.highestCheckout ? String(s.highestCheckout) : "–"), x01: true },
    { label: "Highest visit", value: (s) => String(s.highest) },
    { label: "180s", value: (s) => String(s.n180) },
    { label: "140+", value: (s) => String(s.n140) },
    { label: "100+", value: (s) => String(s.n100) },
    { label: "Darts thrown", value: (s) => String(s.darts) },
  ];
  const visibleRows = rows.filter((r) => !r.x01 || game.mode === "x01");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-5 pt-4 sm:px-8">
      <div className="text-center">
        <p className="text-lg text-dim">{stopped ? "Session ended" : isMatch ? "Game shot" : "Finished"}</p>
        <h1 className="font-display text-7xl font-extrabold tracking-tight sm:text-8xl">{headline}</h1>
        <p className="mt-2 font-display text-3xl font-semibold text-brass">{sub}</p>
      </div>

      {showScoring && (
        <div className="overflow-x-auto rounded-3xl bg-cabinet">
          <table className="w-full text-left">
            {game.players.length > 1 && (
              <thead>
                <tr className="border-b border-wire">
                  <th className="px-5 py-4" />
                  {game.players.map((p) => (
                    <th key={p.id} scope="col" className="px-5 py-4 text-right">
                      <span className="inline-flex items-center gap-2 text-lg font-semibold">
                        <Avatar name={p.name} color={p.color} url={p.avatarUrl} size={28} />
                        {p.name.split(" ")[0]}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.label} className="border-b border-wire/60 last:border-0">
                  <th scope="row" className="px-5 py-2.5 font-medium text-dim">
                    {r.label}
                  </th>
                  {stats.map((s, i) => (
                    <td key={i} className="px-5 py-2.5 text-right font-display text-2xl font-semibold">
                      {r.value(s)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {game.mode === "cricket" && <CricketDetail game={game} state={state as StateMap["cricket"]} />}
      {!showScoring && !(game.mode === "cricket" && isMatch) && <PracticeDetail game={game} state={state} />}

      {plan && (
        <ol className="flex flex-wrap gap-2" aria-label="Training plan">
          {plan.steps.map((title, i) => (
            <li
              key={i}
              className={`rounded-xl px-3 py-1.5 font-medium ${i < plan.index ? "bg-treble/25 text-chalk" : i === plan.index ? "bg-brass text-ink" : "bg-cabinet text-dim"}`}
            >
              {i + 1}. {title}
            </li>
          ))}
        </ol>
      )}

      {note && <p className="text-center text-dim">{note}</p>}
      <div className={`safe-bottom sticky bottom-0 mt-auto grid gap-3 bg-ink pt-3 ${!stopped && canUndo ? "sm:grid-cols-[auto_1fr_1fr]" : "sm:grid-cols-2"}`}>
        {!stopped && canUndo && (
          <button type="button" onClick={onUndo} className="h-16 rounded-2xl bg-cabinet px-6 text-lg font-semibold text-dim hover:text-chalk">
            Undo last dart
          </button>
        )}
        {plan && plan.index < plan.steps.length - 1 ? (
          <button type="button" onClick={plan.onNext} className="h-16 rounded-2xl bg-treble font-display text-2xl font-bold text-ink">
            Next: {plan.steps[plan.index + 1]}
          </button>
        ) : (
          <button type="button" onClick={onAgain} className="h-16 rounded-2xl bg-felt font-display text-2xl font-bold hover:bg-wire">
            {againLabel ?? (isMatch ? "Rematch" : "Go again")}
          </button>
        )}
        <button type="button" onClick={onDone} className="h-16 rounded-2xl bg-chalk font-display text-2xl font-bold text-ink">
          {doneLabel}
        </button>
      </div>
    </div>
  );
}

function practiceHeadline(game: ActiveGame, state: AnyState): string {
  const s = state as StateMap[typeof game.mode];
  const darts = state.turns.reduce((n, t) => n + turnDarts(t), 0);
  switch (game.mode) {
    case "scoring":
      return `${fmtAvg(playerStats(state, 0).average)} average`;
    case "x01":
      return state.finished ? `${darts} darts` : `${(s as StateMap["x01"]).remaining[0]} left`;
    case "around":
      return state.finished ? `${darts} darts` : `Reached ${(s as StateMap["around"]).targets[(s as StateMap["around"]).index]}`;
    case "bobs27": {
      const b = s as StateMap["bobs27"];
      return b.score <= 0 ? `Out on ${doubleLabel(BOBS_TARGETS[b.round - 1])}` : `${b.score} points`;
    }
    case "doubles": {
      const hits = state.turns.reduce((n, t) => n + t.points, 0);
      return `${hits} of ${darts} hit`;
    }
    case "checkout": {
      const c = s as StateMap["checkout"];
      return `${c.results.filter(Boolean).length} of ${c.results.length} out`;
    }
    case "shanghai":
      return `${(s as StateMap["shanghai"]).score} points`;
    case "cricket":
      return state.finished ? `${darts} darts` : `${(s as StateMap["cricket"]).marks[0].filter((m) => m >= 3).length} of 7 closed`;
    case "onetwentyone": {
      const o = s as StateMap["onetwentyone"];
      const best = Math.max(0, ...o.results.filter((r) => r.success).map((r) => r.target));
      return best ? `Up to ${best}` : "No finishes";
    }
    case "target": {
      const t = s as StateMap["target"];
      return `${t.hits.reduce((n, h) => n + h, 0)} of ${darts} hit`;
    }
    default:
      return "";
  }
}

function CricketDetail({ game, state }: { game: ActiveGame; state: StateMap["cricket"] }) {
  return (
    <dl className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(game.players.length, 4)}, minmax(0, 1fr))` }}>
      {game.players.map((p, i) => {
        const mine = state.turns.filter((t) => t.player === i);
        return (
          <div key={p.id} className="flex flex-col gap-1 rounded-2xl bg-cabinet p-5">
            <dt className="flex items-center gap-2 font-semibold">
              <Avatar name={p.name} color={p.color} url={p.avatarUrl} size={26} /> {p.name.split(" ")[0]}
            </dt>
            <dd className="font-display text-4xl font-bold">
              {(cricketMpr(mine) ?? 0).toFixed(2)} <span className="text-lg font-medium text-dim">marks per round</span>
            </dd>
            <dd className="text-dim">{mine.reduce((n, t) => n + t.darts.length, 0)} darts</dd>
          </div>
        );
      })}
    </dl>
  );
}

function PracticeDetail({ game, state }: { game: ActiveGame; state: AnyState }) {
  const darts = state.turns.flatMap((t) => t.darts);
  const aimed = darts.filter((d) => d.hit !== null);
  const hits = aimed.filter((d) => d.hit).length;
  const atDouble = darts.filter((d) => d.atDouble);
  const items: [string, string][] = [["Darts thrown", String(darts.length)]];
  // Drills aimed at doubles report the double rate; the rest report hits on their target.
  if (atDouble.length) {
    const doubles = atDouble.filter((d) => d.hit).length;
    items.push(["Doubles hit", `${doubles}/${atDouble.length}`], ["Double rate", fmtPct((doubles / atDouble.length) * 100)]);
  } else if (aimed.length) {
    items.push(["Hit rate", fmtPct((hits / aimed.length) * 100)]);
  }
  if (game.mode === "shanghai") items.push(["Shanghais", String((state as StateMap["shanghai"]).shanghais)]);
  if (game.mode === "target") {
    const misses = new Map<string, number>();
    for (const d of darts) if (!d.hit) misses.set(dartLabel(d), (misses.get(dartLabel(d)) ?? 0) + 1);
    const top = [...misses.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) items.push(["Most misses", `${top[0]} ×${top[1]}`]);
  }

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-2xl bg-cabinet p-5">
          <dt className="text-dim">{k}</dt>
          <dd className="font-display text-4xl font-bold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
