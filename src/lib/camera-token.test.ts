import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { signCameraToken, verifyCameraToken } from "./camera-token";

const secret = "test-camera-signing-secret";
const payload = { r: "cc340178-be6c-4ac8-a361-a78b8b975940", p: "0aad6019-1b27-49c6-822e-8aad8664d585", e: 2000 };

describe("camera bearer tokens", () => {
  it("roundtrips room, player and expiry through a URL-safe signed token", () => {
    const token = signCameraToken(payload, secret);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(verifyCameraToken(token, secret, 1000)).toEqual({ ok: true, payload });
  });

  it("rejects a tampered payload", () => {
    const signature = signCameraToken(payload, secret).split(".")[1];
    const changed = Buffer.from(JSON.stringify({ ...payload, e: 9000 })).toString("base64url");
    expect(verifyCameraToken(`${changed}.${signature}`, secret, 1000)).toEqual({ ok: false, error: "invalid" });
  });

  it("rejects a tampered signature, including the wrong length", () => {
    const [part, signature] = signCameraToken(payload, secret).split(".");
    const changed = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
    for (const sig of [changed, signature.slice(1), `${signature}A`]) {
      expect(verifyCameraToken(`${part}.${sig}`, secret, 1000)).toEqual({ ok: false, error: "invalid" });
    }
  });

  it("expires at the exact expiry second and afterwards", () => {
    const token = signCameraToken(payload, secret);
    expect(verifyCameraToken(token, secret, 1999).ok).toBe(true);
    expect(verifyCameraToken(token, secret, 2000)).toEqual({ ok: false, error: "expired" });
    expect(verifyCameraToken(token, secret, 2001)).toEqual({ ok: false, error: "expired" });
  });

  it("rejects malformed tokens, signed invalid claims and another signing key", () => {
    for (const token of ["", "a.b.c", "!.!", "a.a", "a".repeat(2049), signCameraToken({ ...payload, r: "bad" }, secret),
      signCameraToken({ ...payload, e: 1.5 }, secret), signCameraToken(payload, "another-secret")]) {
      expect(verifyCameraToken(token, secret, 1000)).toEqual({ ok: false, error: "invalid" });
    }
  });
});
