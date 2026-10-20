"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Segmented, Sheet } from "@/components/ui";
import { MODES, type ModeId } from "@/lib/darts/modes";
import { checkoutTargets, doublesTargets } from "@/lib/darts/modes/practice";
import { type GamePlayer, gameStore, startGame } from "@/lib/game-store";

type Drill = {
  mode: ModeId;
  /** Short mark that says what the drill is about at a glance. */
  mark: string;
  name?: string;
  blurb?: string;
};

const DRILLS: Drill[] = [
  { mode: "scoring", mark: "180" },
  { mode: "x01", mark: "501", name: "Solo X01", blurb: "Play a leg on your own and check out." },
  { mode: "checkout", mark: "121" },
  { mode: "doubles", mark: "D16" },
  { mode: "around", mark: "1–20" },
  { mode: "bobs27", mark: "27" },
  { mode: "shanghai", mark: "S·D·T" },
];

type Opts = Record<string, string | number>;

const DEFAULTS: Record<ModeId, Opts> = {
  scoring: { rounds: 0 },
  x01: { startScore: 501, out: "double" },
  checkout: { range: "61-100", darts: 3, attempts: 10 },
  doubles: { order: "sequence" },
  around: { ring: "any" },
  bobs27: {},
  shanghai: { rounds: 7 },
};

function buildConfig(mode: ModeId, o: Opts) {
  switch (mode) {
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

export function PracticePicker({ me }: { me: GamePlayer }) {
  const router = useRouter();
  const [open, setOpen] = useState<Drill | null>(null);
  const [opts, setOpts] = useState<Opts>({});

  function choose(d: Drill) {
    setOpts({ ...DEFAULTS[d.mode], ...gameStore.prefs<Opts>(`practice:${d.mode}`, {}) });
    setOpen(d);
  }

  function start() {
    if (!open) return;
    const current = gameStore.active();
    if (current && current.darts.length > 0 && !window.confirm("Starting a new game ends the one in progress. Start anyway?")) return;
    gameStore.setPref(`practice:${open.mode}`, opts);
    startGame({ kind: "practice", mode: open.mode, config: buildConfig(open.mode, opts) as never, players: [me] });
    router.push("/play");
  }

  const set = (key: string) => (v: string | number) => setOpts((o) => ({ ...o, [key]: v }));

  return (
    <>
      <ul className="grid grid-cols-1 gap-3 pb-6 sm:grid-cols-2 lg:grid-cols-3">
        {DRILLS.map((d) => (
          <li key={d.mode}>
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
    </>
  );
}
