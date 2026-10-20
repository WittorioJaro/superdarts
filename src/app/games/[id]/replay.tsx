"use client";

import { useMemo, useState } from "react";
import { BOARD, Dartboard } from "@/components/dartboard";
import { Avatar } from "@/components/ui";
import { dartPoint } from "@/lib/board-geometry";
import { dartLabel } from "@/lib/darts/board";
import type { Turn } from "@/lib/darts/engine";
import { replay } from "@/lib/darts/modes";
import { fmtAvg } from "@/lib/darts/stats";
import type { getGame } from "@/lib/queries";

type Game = NonNullable<Awaited<ReturnType<typeof getGame>>>;

export function Replay({ game }: { game: Game }) {
  const state = useMemo(() => replay(game.mode, game.config as never, game.players.length, game.darts), [game]);
  const legs = useMemo(() => [...new Set(state.turns.map((t) => t.leg))].sort((a, b) => a - b), [state]);
  const [leg, setLeg] = useState(legs[0] ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <Scoreline game={game} />
      {legs.length > 1 && (
        <nav aria-label="Legs" className="flex flex-wrap gap-2">
          {legs.map((l) => {
            const winner = state.turns.find((t) => t.leg === l && t.checkout)?.player;
            return (
              <button
                key={l}
                type="button"
                aria-pressed={leg === l}
                onClick={() => setLeg(l)}
                className={`flex h-11 items-center gap-2 rounded-xl px-4 font-medium transition ${leg === l ? "bg-chalk text-ink" : "bg-cabinet hover:bg-felt"}`}
              >
                {winner !== undefined && <span className="h-3 w-3 rounded-full" style={{ background: game.players[winner]?.color }} />}
                Leg {l + 1}
              </button>
            );
          })}
        </nav>
      )}
      <LegReplay key={leg} game={game} turns={state.turns.filter((t) => t.leg === leg)} />
    </div>
  );
}

function Scoreline({ game }: { game: Game }) {
  const sets = Number((game.config as unknown as Record<string, unknown>).sets) > 1;
  return (
    <ul className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(game.players.length, 4)}, minmax(0, 1fr))` }}>
      {game.players.map((p) => (
        <li key={p.id} className={`flex items-center gap-3 rounded-2xl p-4 ${p.winner ? "bg-felt ring-2 ring-brass" : "bg-cabinet"}`}>
          <Avatar name={p.name} color={p.color} url={p.avatarUrl} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-semibold">{p.name}</span>
            <span className="block text-sm text-dim">{p.average !== null ? `${fmtAvg(p.average)} average` : `Score ${p.score}`}</span>
          </span>
          {game.kind === "match" && <span className="font-display text-4xl font-extrabold">{sets ? p.setsWon : p.legsWon}</span>}
        </li>
      ))}
    </ul>
  );
}

function LegReplay({ game, turns }: { game: Game; turns: Turn[] }) {
  const [step, setStep] = useState(turns.length);
  const shown = turns.slice(0, step);
  const rounds = Math.max(0, ...turns.map((t) => t.visit + 1));
  const x01 = game.mode === "x01";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section aria-label="Darts on the board" className="flex flex-col gap-4 rounded-3xl bg-cabinet p-5 lg:sticky lg:top-4 lg:self-start">
        <Dartboard label={`Darts thrown up to visit ${step}`} className="mx-auto h-auto w-full max-w-md">
          {shown.flatMap((t, ti) =>
            t.darts
              .filter((d) => !d.v)
              .map((d, di) => {
                const [x, y] = dartPoint(BOARD.C, BOARD.C, BOARD.R, d, ti * 7 + di * 3 + t.leg * 1000);
                const latest = ti === step - 1;
                return (
                  <circle
                    key={`${ti}-${di}`}
                    cx={x}
                    cy={y}
                    r={latest ? 6 : 4}
                    fill={game.players[t.player]?.color}
                    stroke={latest ? "var(--color-chalk)" : "var(--color-ink)"}
                    strokeWidth={latest ? 2 : 1}
                    opacity={latest ? 1 : 0.7}
                  >
                    <title>{`${game.players[t.player]?.name}: ${dartLabel(d)}`}</title>
                  </circle>
                );
              }),
          )}
        </Dartboard>
        {shown.length > 0 && shown.every((t) => t.darts.every((d) => d.v)) && (
          <p className="text-center text-sm text-dim">These visits were entered as totals, so where each dart landed wasn&apos;t recorded.</p>
        )}
        <label className="flex flex-col gap-2">
          <span className="flex justify-between text-sm text-dim">
            <span>Visit {step} of {turns.length}</span>
            <button type="button" onClick={() => setStep(turns.length)} className="hover:text-chalk">
              Show all
            </button>
          </span>
          <input
            type="range"
            min={0}
            max={turns.length}
            value={step}
            onChange={(e) => setStep(Number(e.target.value))}
            className="w-full accent-[var(--color-brass)]"
          />
        </label>
      </section>

      <section aria-label="Visits" className="overflow-x-auto rounded-3xl bg-cabinet">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-wire">
              <th scope="col" className="w-12 px-4 py-3 text-sm font-medium text-dim">
                #
              </th>
              {game.players.map((p) => (
                <th key={p.id} scope="col" className="px-4 py-3">
                  <span className="flex items-center gap-2 font-semibold">
                    <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                    {p.name.split(" ")[0]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rounds }, (_, r) => (
              <tr key={r} className="border-b border-wire/50 last:border-0">
                <th scope="row" className="px-4 py-2 align-top font-display text-lg text-dim">
                  {r + 1}
                </th>
                {game.players.map((_, pi) => {
                  const index = turns.findIndex((t) => t.player === pi && t.visit === r);
                  const t = turns[index];
                  if (!t) return <td key={pi} />;
                  const after = t.startScore === null ? null : t.bust ? t.startScore : t.startScore - t.points;
                  return (
                    <td key={pi} className="px-2 py-1 align-top">
                      <button
                        type="button"
                        onClick={() => setStep(index + 1)}
                        aria-pressed={step === index + 1}
                        className={`flex w-full flex-col rounded-xl px-2 py-1.5 text-left transition ${
                          step === index + 1 ? "bg-felt ring-2 ring-brass" : index < step ? "hover:bg-felt" : "opacity-40 hover:opacity-70"
                        }`}
                      >
                        <span className="flex items-baseline justify-between gap-3">
                          <span className={`font-display text-2xl font-bold ${t.checkout ? "text-brass" : t.bust ? "text-double" : ""}`}>
                            {t.bust ? "Bust" : t.points}
                          </span>
                          {x01 && after !== null && <span className="font-display text-lg text-dim">{after}</span>}
                        </span>
                        <span className="truncate text-sm text-dim">{t.darts.map((d) => (d.v ? `${d.v.total} total` : dartLabel(d))).join(" · ")}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
