import { MODES, type ModeId } from "./modes";

const OUT_LABEL = { double: "Double out", single: "Straight out", master: "Master out" } as const;

/** Short title for a game, e.g. "501" or "Around the clock". */
export function gameTitle(mode: ModeId, config: Record<string, unknown>): string {
  if (mode === "x01") return String(config.startScore);
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
