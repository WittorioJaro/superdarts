import { z } from "zod";

export const VISION_TOPIC = "sd-vision";
export const VISION_VERSION = 1;
export const MAX_MESSAGE_BYTES = 8192;
const finite = z.number().finite();
const point = z.object({ x: finite.min(-5).max(5), y: finite.min(-5).max(5) });
const dart = z.object({ s: z.number().int(), m: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]) })
  .refine((d) => d.s === 0 ? d.m === 0 : d.s === 25 ? d.m === 1 || d.m === 2 : d.s >= 1 && d.s <= 20 && d.m >= 1);
const id = z.string().min(1).max(128);
const at = finite.nonnegative();
const candidates = z.array(z.object({ dart, p: finite.min(0).max(1) })).min(1).max(12).refine((list) => {
  const keys = new Set(list.map((c) => c.dart.s * 4 + c.dart.m));
  return keys.size === list.length && list.reduce((sum, c) => sum + c.p, 0) <= 1.001 && list.every((c, i) => i === 0 || c.p <= list[i - 1].p);
});
export const visionMessageSchema = z.discriminatedUnion("kind", [
  z.object({ v: z.literal(1), kind: z.literal("dart"), id, at, board: point, sigma: finite.positive().max(2), candidates }),
  z.object({ v: z.literal(1), kind: z.literal("takeout"), at }),
  z.object({ v: z.literal(1), kind: z.literal("status"), calibrated: z.boolean(), state: z.enum(["waiting", "watching", "motion", "settling", "unsure"]), fps: finite.min(0).max(240) }),
  z.object({ v: z.literal(1), kind: z.literal("correction"), id, dart }),
  z.object({ v: z.literal(1), kind: z.literal("reset") }),
  z.object({ v: z.literal(1), kind: z.literal("visit") }),
]);
export type VisionMessage = z.infer<typeof visionMessageSchema>;
export type PhoneMessage = Extract<VisionMessage, { kind: "dart" | "takeout" | "status" }>;
export type IpadMessage = Extract<VisionMessage, { kind: "correction" | "reset" | "visit" }>;
const encoder = new TextEncoder(), decoder = new TextDecoder("utf-8", { fatal: true });

/** Both helpers validate and return null for malformed/unsupported/oversized input. */
export function encodeMessage(message: unknown): Uint8Array | null {
  try {
    const parsed = visionMessageSchema.safeParse(message);
    if (!parsed.success) return null;
    const bytes = encoder.encode(JSON.stringify(parsed.data));
    return bytes.length <= MAX_MESSAGE_BYTES ? bytes : null;
  } catch { return null; }
}
export function decodeMessage(bytes: Uint8Array): VisionMessage | null {
  try {
    if (bytes.length > MAX_MESSAGE_BYTES) return null;
    const parsed = visionMessageSchema.safeParse(JSON.parse(decoder.decode(bytes)));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
