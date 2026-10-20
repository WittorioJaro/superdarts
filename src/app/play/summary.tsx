"use client";

import { Avatar } from "@/components/ui";
import { doubleLabel } from "@/lib/darts/board";
import type { BaseState } from "@/lib/darts/engine";
import { gameDetail, gameTitle } from "@/lib/darts/labels";
import { type AnyState, MODES, type StateMap, results } from "@/lib/darts/modes";
import { BOBS_TARGETS } from "@/lib/darts/modes/practice";
import { type ScoringStats, fmtAvg, fmtPct, scoringStats } from "@/lib/darts/stats";
import type { ActiveGame } from "@/lib/game-store";

export function playerStats(state: BaseState, player: number): ScoringStats {
  const mine = state.turns.filter((t) => t.player === player);
  return scoringStats(
    mine.map((t) => ({
      points: t.points,
      darts: t.darts.length,
      bust: t.bust,
      checkout: t.checkout,
      startScore: t.startScore,
      visit: t.visit,
      legKey: String(t.leg),
    })),
    mine.reduce((n, t) => n + t.darts.filter((d) => d.atDouble).length, 0),
  );
}

export function Summary({
  game,
  state,
  stopped,
  onAgain,
  onDone,
  onUndo,
}: {
  game: ActiveGame;
  state: AnyState;
  stopped: boolean;
  onAgain: () => void;
  onDone: () => void;
  onUndo: () => void;
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

      {!showScoring && <PracticeDetail game={game} state={state} />}

      <div className="safe-bottom sticky bottom-0 mt-auto grid gap-3 bg-ink pt-3 sm:grid-cols-[auto_1fr_1fr]">
        {!stopped && (
          <button type="button" onClick={onUndo} className="h-16 rounded-2xl bg-cabinet px-6 text-lg font-semibold text-dim hover:text-chalk">
            Undo last dart
          </button>
        )}
        <button type="button" onClick={onAgain} className="h-16 rounded-2xl bg-felt font-display text-2xl font-bold hover:bg-wire">
          {isMatch ? "Rematch" : "Go again"}
        </button>
        <button type="button" onClick={onDone} className="h-16 rounded-2xl bg-chalk font-display text-2xl font-bold text-ink">
          Save and finish
        </button>
      </div>
    </div>
  );
}

function practiceHeadline(game: ActiveGame, state: AnyState): string {
  const s = state as StateMap[typeof game.mode];
  const darts = state.turns.reduce((n, t) => n + t.darts.length, 0);
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
  }
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
