"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Segmented, Sheet } from "@/components/ui";
import { dartLabel } from "@/lib/darts/board";
import { MODES, type ModeId } from "@/lib/darts/modes";
import { checkoutTargets, doublesTargets } from "@/lib/darts/modes/practice";
import { type GamePlayer, gameStore, startGame } from "@/lib/game-store";
import { type PlanStep, startPlanStep } from "@/lib/plan-store";

type Weak = { s: number; m: 1 | 2 | 3; attempts: number; hits: number; rate: number };

type Drill = {
  /** Unique per tile; several tiles can share a mode. */
  id: string;
  mode: ModeId;
  /** Short mark that says what the drill is about at a glance. */
  mark: string;
  name?: string;
  blurb?: string;
};

const DRILLS: Drill[] = [
  { id: "scoring", mode: "scoring", mark: "180" },
  { id: "x01", mode: "x01", mark: "501", name: "Solo X01", blurb: "Play a leg on your own and check out." },
  { id: "target", mode: "target", mark: "T20", name: "Target practice", blurb: "Pick one target and throw at it. See exactly where the misses go." },
  { id: "checkout", mode: "checkout", mark: "2–170" },
  { id: "onetwentyone", mode: "onetwentyone", mark: "121", name: "121", blurb: "Check out 121 in nine darts. Make it and the target goes up by one." },
  { id: "doubles", mode: "doubles", mark: "D16" },
  { id: "weakness", mode: "target", mark: "Weak", name: "Weakness trainer", blurb: "Your five worst targets from your stats, one after another." },
  { id: "cricket", mode: "cricket", mark: "15–B", name: "Cricket", blurb: "Close 15 to 20 and the bull in as few darts as you can." },
  { id: "around", mode: "around", mark: "1–20" },
  { id: "bobs27", mode: "bobs27", mark: "27" },
  { id: "shanghai", mode: "shanghai", mark: "S·D·T" },
];

const TARGETS = [
  { s: 20, m: 3 },
  { s: 19, m: 3 },
  { s: 18, m: 3 },
  { s: 20, m: 1 },
  { s: 25, m: 1 },
  { s: 25, m: 2 },
  { s: 20, m: 2 },
  { s: 16, m: 2 },
  { s: 8, m: 2 },
] as const;

type Opts = Record<string, string | number>;

const DEFAULTS: Record<string, Opts> = {
  scoring: { rounds: 0 },
  target: { target: "20:3", darts: 99 },
  weakness: { darts: 15 },
  onetwentyone: { attempts: 10, darts: 9, onFail: "stay" },
  cricket: {},
  x01: { startScore: 501, out: "double" },
  checkout: { range: "61-100", darts: 3, attempts: 10 },
  doubles: { order: "sequence" },
  around: { ring: "any" },
  bobs27: {},
  shanghai: { rounds: 7 },
};

function buildConfig(drill: Drill, o: Opts, weak: Weak[]) {
  if (drill.id === "weakness") return { targets: weak.map((w) => ({ s: w.s, m: w.m })), dartsPerTarget: Number(o.darts) };
  switch (drill.mode) {
    case "target": {
      const [s, m] = String(o.target).split(":").map(Number);
      return { targets: [{ s, m }], dartsPerTarget: Number(o.darts) };
    }
    case "onetwentyone":
      return { start: 121, attempts: Number(o.attempts), darts: Number(o.darts), onFail: o.onFail };
    case "cricket":
      return { variant: "standard", legs: 1 };
    case "x01":
      return { startScore: Number(o.startScore), out: o.out, legs: 1, sets: 1 };
    case "checkout": {
      const [min, max] = String(o.range).split("-").map(Number);
      return { min, max, darts: Number(o.darts), targets: checkoutTargets(min, max, Number(o.attempts)) };
    }
    case "doubles":
      return { order: o.order, targets: doublesTargets(o.order as "sequence" | "random") };
    default:
      return { ...o };
  }
}

export function PracticePicker({ me, weak, plan }: { me: GamePlayer; weak: Weak[]; plan: { minutes: number; steps: PlanStep[] } }) {
  const router = useRouter();
  // The counter has no server data, so it can be fully loaded before Start is tapped.
  useEffect(() => router.prefetch("/play"), [router]);
  const [open, setOpen] = useState<Drill | null>(null);
  const [opts, setOpts] = useState<Opts>({});
  const [training, setTraining] = useState(false);

  function choose(d: Drill) {
    setOpts({ ...DEFAULTS[d.id], ...gameStore.prefs<Opts>(`practice:${d.id}`, {}) });
    setOpen(d);
  }

  function replacesGame() {
    const current = gameStore.active();
    return !!current && current.darts.length > 0 && !window.confirm("Starting a new game ends the one in progress. Start anyway?");
  }

  function start() {
    if (!open || replacesGame()) return;
    gameStore.setPref(`practice:${open.id}`, opts);
    startGame({ kind: "practice", mode: open.mode, config: buildConfig(open, opts, weak) as never, players: [me] });
    router.push("/play");
  }

  function startTraining() {
    if (replacesGame()) return;
    startPlanStep(plan.steps, 0, me);
    router.push("/play");
  }

  const set = (key: string) => (v: string | number) => setOpts((o) => ({ ...o, [key]: v }));

  return (
    <>
      <button
        type="button"
        onClick={() => setTraining(true)}
        className="flex flex-col gap-4 rounded-[2rem] bg-treble p-7 text-left text-ink transition active:scale-[0.99] sm:flex-row sm:items-end sm:justify-between"
      >
        <span>
          <span className="block text-lg font-semibold text-ink/70">Today&apos;s training, {plan.minutes} minutes</span>
          <span className="block font-display text-5xl leading-none font-extrabold tracking-tight sm:text-6xl">Built from your stats</span>
        </span>
        <span className="flex flex-wrap gap-2">
          {plan.steps.map((s, i) => (
            <span key={i} className="rounded-xl bg-ink/15 px-3 py-1.5 font-semibold">
              {s.title}
            </span>
          ))}
        </span>
      </button>

      <ul className="grid grid-cols-1 gap-3 pb-6 sm:grid-cols-2 lg:grid-cols-3">
        {DRILLS.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              onClick={() => choose(d)}
              className="group flex h-full min-h-40 w-full flex-col justify-between gap-4 rounded-3xl bg-cabinet p-6 text-left transition hover:bg-felt active:scale-[0.99]"
            >
              <span className="font-display text-5xl font-extrabold text-brass">{d.mark}</span>
              <span>
                <span className="block font-display text-3xl font-bold">{d.name ?? MODES[d.mode].name}</span>
                <span className="mt-1 block text-dim">{d.blurb ?? MODES[d.mode].blurb}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Sheet open={!!open} onClose={() => setOpen(null)} label={open ? (open.name ?? MODES[open.mode].name) : "Drill"}>
        {open && (
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="font-display text-4xl font-extrabold">{open.name ?? MODES[open.mode].name}</h2>
              <p className="mt-1 text-dim">{open.blurb ?? MODES[open.mode].blurb}</p>
            </div>

            {open.id === "target" && (
              <>
                <Segmented
                  label="Target"
                  value={String(opts.target)}
                  onChange={set("target")}
                  options={TARGETS.map((t) => ({ value: `${t.s}:${t.m}`, label: dartLabel(t) }))}
                />
                <Segmented
                  label="Darts"
                  value={Number(opts.darts)}
                  onChange={set("darts")}
                  options={[30, 60, 99].map((n) => ({ value: n, label: n === 99 ? "99 (T20 challenge)" : String(n) }))}
                />
              </>
            )}

            {open.id === "weakness" && (
              <>
                <ul className="flex flex-col divide-y divide-wire rounded-2xl bg-felt">
                  {weak.map((w) => (
                    <li key={`${w.s}:${w.m}`} className="flex items-center justify-between px-4 py-3">
                      <span className="font-display text-2xl font-bold">{dartLabel(w)}</span>
                      <span className="text-dim">{w.attempts ? `${Math.round(w.rate * 100)}% of ${w.attempts} darts` : "No data yet"}</span>
                    </li>
                  ))}
                </ul>
                <Segmented
                  label="Darts at each"
                  value={Number(opts.darts)}
                  onChange={set("darts")}
                  options={[9, 15, 30].map((n) => ({ value: n, label: String(n) }))}
                />
              </>
            )}

            {open.mode === "onetwentyone" && (
              <>
                <Segmented
                  label="Darts per attempt"
                  value={Number(opts.darts)}
                  onChange={set("darts")}
                  options={[9, 6, 3].map((n) => ({ value: n, label: String(n) }))}
                />
                <Segmented
                  label="Miss it and"
                  value={String(opts.onFail)}
                  onChange={set("onFail")}
                  options={[
                    { value: "stay", label: "Try the same again" },
                    { value: "reset", label: "Back to 121" },
                  ]}
                />
                <Segmented
                  label="Attempts"
                  value={Number(opts.attempts)}
                  onChange={set("attempts")}
                  options={[5, 10, 20].map((n) => ({ value: n, label: String(n) }))}
                />
              </>
            )}

            {open.mode === "scoring" && (
              <Segmented
                label="Visits"
                value={Number(opts.rounds)}
                onChange={set("rounds")}
                options={[
                  { value: 0, label: "No limit" },
                  { value: 10, label: "10" },
                  { value: 20, label: "20" },
                  { value: 33, label: "33" },
                ]}
              />
            )}

            {open.mode === "x01" && (
              <>
                <Segmented
                  label="Start from"
                  value={Number(opts.startScore)}
                  onChange={set("startScore")}
                  options={[301, 501, 701].map((n) => ({ value: n, label: String(n) }))}
                />
                <Segmented
                  label="Finish on"
                  value={String(opts.out)}
                  onChange={set("out")}
                  options={[
                    { value: "double", label: "Double" },
                    { value: "single", label: "Anything" },
                  ]}
                />
              </>
            )}

            {open.mode === "checkout" && (
              <>
                <Segmented
                  label="Finishes between"
                  value={String(opts.range)}
                  onChange={set("range")}
                  options={["2-40", "41-80", "61-100", "81-120", "101-170"].map((r) => ({ value: r, label: r.replace("-", "–") }))}
                />
                <Segmented
                  label="Darts per finish"
                  value={Number(opts.darts)}
                  onChange={set("darts")}
                  options={[
                    { value: 3, label: "3" },
                    { value: 6, label: "6" },
                    { value: 9, label: "9" },
                  ]}
                />
                <Segmented
                  label="Finishes"
                  value={Number(opts.attempts)}
                  onChange={set("attempts")}
                  options={[10, 20, 30].map((n) => ({ value: n, label: String(n) }))}
                />
              </>
            )}

            {open.mode === "doubles" && (
              <Segmented
                label="Order"
                value={String(opts.order)}
                onChange={set("order")}
                options={[
                  { value: "sequence", label: "1 to 20, then bull" },
                  { value: "random", label: "Random" },
                ]}
              />
            )}

            {open.mode === "around" && (
              <Segmented
                label="Counts if you hit"
                value={String(opts.ring)}
                onChange={set("ring")}
                options={[
                  { value: "any", label: "Any ring" },
                  { value: "double", label: "Doubles" },
                  { value: "treble", label: "Trebles" },
                ]}
              />
            )}

            {open.mode === "shanghai" && (
              <Segmented
                label="Numbers"
                value={Number(opts.rounds)}
                onChange={set("rounds")}
                options={[
                  { value: 7, label: "1–7" },
                  { value: 20, label: "1–20" },
                ]}
              />
            )}

            <button
              type="button"
              onClick={start}
              className="h-16 rounded-2xl bg-treble font-display text-2xl font-bold text-ink transition active:scale-[0.98]"
            >
              Start
            </button>
          </div>
        )}
      </Sheet>

      <Sheet open={training} onClose={() => setTraining(false)} label="Today's training">
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="font-display text-4xl font-extrabold">Today&apos;s training</h2>
            <p className="mt-1 text-dim">About {plan.minutes} minutes. Picked from where your stats say you lose the most points.</p>
          </div>
          <ol className="flex flex-col gap-2">
            {plan.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-4 rounded-2xl bg-felt p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-chalk font-display text-xl font-bold text-ink">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-2xl font-bold">{s.title}</span>
                    <span className="shrink-0 text-dim">{s.minutes} min</span>
                  </span>
                  <span className="block text-dim">{s.reason}</span>
                </span>
              </li>
            ))}
          </ol>
          <button type="button" onClick={startTraining} className="h-16 rounded-2xl bg-treble font-display text-2xl font-bold text-ink transition active:scale-[0.98]">
            Start training
          </button>
        </div>
      </Sheet>
    </>
  );
}
