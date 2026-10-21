"use client";

import { Segmented } from "@/components/ui";
import type { ConfigMap } from "@/lib/darts/modes";
import type { X01Config } from "@/lib/darts/modes/x01";

/** The format controls shared by local matches and online rooms. */
export type GameOpts = {
  game: "x01" | "cricket";
  startScore: number;
  out: X01Config["out"];
  legs: number;
  sets: number;
  useSets: boolean;
  variant: ConfigMap["cricket"]["variant"];
  ranked: boolean;
};

export const DEFAULT_OPTS: GameOpts = { game: "x01", startScore: 501, out: "double", legs: 3, sets: 3, useSets: false, variant: "standard", ranked: true };

export function x01Config(o: GameOpts): X01Config {
  return { startScore: o.startScore, out: o.out, legs: o.legs, sets: o.useSets ? o.sets : 1 };
}

export function cricketConfig(o: GameOpts): ConfigMap["cricket"] {
  return { variant: o.variant, legs: o.legs };
}

export function GameOptions({
  opts,
  onChange,
  allowCricket = true,
  canRank,
  rankHint,
}: {
  opts: GameOpts;
  onChange: (o: GameOpts) => void;
  allowCricket?: boolean;
  canRank: boolean;
  /** Why the ranked switch is off, or what it does when on. */
  rankHint: string;
}) {
  const set =
    <K extends keyof GameOpts>(key: K) =>
    (v: GameOpts[K]) =>
      onChange({ ...opts, [key]: v });

  return (
    <>
      <Segmented
        label="Game"
        value={opts.game}
        onChange={set("game")}
        options={[{ value: "x01", label: "X01" }, ...(allowCricket ? [{ value: "cricket" as const, label: "Cricket" }] : [])]}
      />
      {opts.game === "cricket" ? (
        <>
          <Segmented
            label="Points"
            value={opts.variant}
            onChange={set("variant")}
            options={[
              { value: "standard", label: "Standard" },
              { value: "cutthroat", label: "Cut-throat" },
            ]}
          />
          <Segmented label="First to … legs" value={opts.legs} onChange={set("legs")} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} />
        </>
      ) : (
        <>
          <Segmented
            label="Start from"
            value={opts.startScore}
            onChange={set("startScore")}
            options={[301, 501, 701].map((n) => ({ value: n, label: String(n) }))}
          />
          <Segmented
            label="Finish on"
            value={opts.out}
            onChange={set("out")}
            options={[
              { value: "double", label: "Double" },
              { value: "master", label: "Double or treble" },
              { value: "single", label: "Anything" },
            ]}
          />
          <Segmented
            label="Play"
            value={opts.useSets ? "sets" : "legs"}
            onChange={(v) => set("useSets")(v === "sets")}
            options={[
              { value: "legs", label: "Legs" },
              { value: "sets", label: "Sets" },
            ]}
          />
          {opts.useSets && (
            <Segmented label="First to … sets" value={opts.sets} onChange={set("sets")} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} />
          )}
          <Segmented
            label={opts.useSets ? "First to … legs per set" : "First to … legs"}
            value={opts.legs}
            onChange={set("legs")}
            options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }))}
          />
        </>
      )}

      <label className={`flex items-center justify-between gap-4 rounded-2xl bg-cabinet p-4 ${canRank ? "" : "opacity-50"}`}>
        <span>
          <span className="block text-lg font-semibold">Ranked</span>
          <span className="block text-sm text-dim">{rankHint}</span>
        </span>
        <input
          type="checkbox"
          checked={canRank && opts.ranked}
          disabled={!canRank}
          onChange={(e) => set("ranked")(e.target.checked)}
          className="h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-full bg-wire transition before:block before:h-6 before:w-6 before:translate-x-0.5 before:rounded-full before:bg-chalk before:transition checked:bg-treble checked:before:translate-x-[1.35rem]"
        />
      </label>
    </>
  );
}
