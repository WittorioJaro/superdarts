import { dartLabel } from "./board";
import { MODES, type ModeId } from "./modes";

const OUT_LABEL = { double: "Double out", single: "Straight out", master: "Master out" } as const;

/** Short title for a game, e.g. "501" or "Around the clock". */
export function gameTitle(mode: ModeId, config: Record<string, unknown>): string {
  if (mode === "x01") return String(config.startScore);
  if (mode === "target") {
    const targets = config.targets as { s: number; m: 1 | 2 | 3 }[];
    return targets.length === 1 ? `${dartLabel(targets[0])} practice` : "Weakness trainer";
  }
  return MODES[mode].name;
}

/** The settings that make this game different from the default, in a few words. */
export function gameDetail(mode: ModeId, config: Record<string, unknown>): string {
  switch (mode) {
    case "x01": {
      const out = OUT_LABEL[config.out as keyof typeof OUT_LABEL];
      const sets = Number(config.sets);
      const legs = Number(config.legs);
      const format =
        sets > 1
          ? `First to ${sets} sets of ${legs} ${legs === 1 ? "leg" : "legs"}`
          : `First to ${legs} ${legs === 1 ? "leg" : "legs"}`;
      return `${format}, ${out.toLowerCase()}`;
    }
    case "cricket": return `${config.variant === "cutthroat" ? "Cut-throat" : "Standard"}, first to ${config.legs}`;
    case "onetwentyone": return `From ${config.start}, ${config.attempts} targets, ${config.darts} darts each`;
    case "target": {
      const targets = config.targets as { s: number; m: 1 | 2 | 3 }[];
      return targets.length === 1 ? `${config.dartsPerTarget} darts` : `${targets.map(dartLabel).join(", ")}, ${config.dartsPerTarget} darts each`;
    }
    case "scoring":
      return Number(config.rounds) > 0 ? `${config.rounds} visits` : "No visit limit";
    case "around":
      return { any: "Any ring", double: "Doubles only", treble: "Trebles only" }[config.ring as string] ?? "";
    case "doubles":
      return config.order === "random" ? "Random order" : "1 to 20, then bull";
    case "checkout":
      return `${config.min}–${config.max}, ${Number(config.darts) / 3} ${config.darts === 3 ? "visit" : "visits"} each`;
    case "shanghai":
      return config.rounds === 7 ? "Numbers 1–7" : "Numbers 1–20";
    case "bobs27":
      return "D1 to bull";
  }
}
