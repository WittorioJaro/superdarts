import { z } from "zod";
import { isValidDart } from "./board";

const doubleTarget = z.number().int().refine((n) => (n >= 1 && n <= 20) || n === 25);

export const configSchemas = {
  x01: z.object({
    startScore: z.number().int().min(101).max(1001),
    out: z.enum(["double", "single", "master"]),
    legs: z.number().int().min(1).max(21),
    sets: z.number().int().min(1).max(13),
  }),
  scoring: z.object({ rounds: z.number().int().min(0).max(200) }),
  around: z.object({ ring: z.enum(["any", "double", "treble"]) }),
  bobs27: z.object({}),
  doubles: z.object({ order: z.enum(["sequence", "random"]), targets: z.array(doubleTarget).min(1).max(63) }),
  checkout: z.object({
    min: z.number().int().min(2).max(170),
    max: z.number().int().min(2).max(170),
    darts: z.union([z.literal(3), z.literal(6), z.literal(9)]),
    targets: z.array(z.number().int().min(2).max(170)).min(1).max(100),
  }),
  shanghai: z.object({ rounds: z.union([z.literal(7), z.literal(20)]) }),
} as const;

export const dartSchema = z
  .object({ s: z.number().int(), m: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]) })
  .refine(isValidDart, "Not a dart on the board");

export const saveGameSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["practice", "match"]),
  mode: z.enum(["x01", "scoring", "around", "bobs27", "doubles", "checkout", "shanghai"]),
  config: z.unknown(),
  playerIds: z.array(z.uuid()).min(1).max(8),
  darts: z.array(dartSchema).min(1).max(5000),
  startedAt: z.iso.datetime(),
});

export type SaveGameInput = z.infer<typeof saveGameSchema>;
