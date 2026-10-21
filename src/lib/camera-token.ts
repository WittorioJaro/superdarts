import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export interface CameraTokenPayload { r: string; p: string; e: number }
type Verification = { ok: true; payload: CameraTokenPayload } | { ok: false; error: "invalid" | "expired" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Explicit secrets keep these server-only primitives independent of environment loading. */
export function signCameraToken(payload: CameraTokenPayload, secret: string): string {
  if (!secret) throw new Error("A camera signing secret is required.");
  const part = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${part}.${createHmac("sha256", secret).update(part).digest("base64url")}`;
}

export function verifyCameraToken(token: string, secret: string, now = Math.floor(Date.now() / 1000)): Verification {
  const invalid: Verification = { ok: false, error: "invalid" };
  if (!secret || typeof token !== "string" || token.length > 2048) return invalid;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return invalid;
  const [part, signature] = parts;
  const expected = createHmac("sha256", secret).update(part).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || actual.toString("base64url") !== signature || !timingSafeEqual(actual, expected)) return invalid;
  try {
    const bytes = Buffer.from(part, "base64url");
    if (bytes.toString("base64url") !== part) return invalid;
    const payload: unknown = JSON.parse(bytes.toString("utf8"));
    if (!payload || typeof payload !== "object" || !("r" in payload) || !("p" in payload) || !("e" in payload)) return invalid;
    const { r, p, e } = payload;
    if (typeof r !== "string" || !uuid.test(r) || typeof p !== "string" || !uuid.test(p) || typeof e !== "number" || !Number.isSafeInteger(e)) {
      return invalid;
    }
    if (e <= now) return { ok: false, error: "expired" };
    return { ok: true, payload: { r, p, e } };
  } catch {
    return invalid;
  }
}
