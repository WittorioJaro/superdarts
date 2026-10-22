import { expect, it } from "vitest";
import { decodeMessage, encodeMessage } from "./protocol";
it("roundtrips every phone and iPad message", () => {
  for (const message of [
    { v: 1, kind: "dart", id: "dart-1", at: 100, board: { x: 0, y: -0.61 }, sigma: 0.01, candidates: [{ dart: { s: 20, m: 3 }, p: 0.9 }] },
    { v: 1, kind: "takeout", at: 200 }, { v: 1, kind: "status", calibrated: true, state: "watching", fps: 30 },
    { v: 1, kind: "correction", id: "dart-1", dart: { s: 25, m: 2 } }, { v: 1, kind: "reset" }, { v: 1, kind: "visit" },
  ]) expect(decodeMessage(encodeMessage(message)!)).toEqual(message);
});
it("rejects invalid JSON, version, darts, NaN, duplicate/unsorted probabilities and oversized payloads without throwing", () => {
  for (const message of [null, {}, { v: 2, kind: "reset" }, { v: 1, kind: "correction", id: "x", dart: { s: 25, m: 3 } },
    { v: 1, kind: "status", calibrated: true, state: "watching", fps: NaN },
    ...[[0.8, 0.8], [0.1, 0.5]].map((ps) => ({ v: 1, kind: "dart", id: "x", at: 1, sigma: 0.01, board: { x: 0, y: 0 }, candidates: ps.map((p) => ({ dart: { s: 20, m: 1 }, p })) })),
  ]) expect(encodeMessage(message)).toBeNull();
  for (const bytes of [new Uint8Array([255]), new Uint8Array(9000), new TextEncoder().encode("{oops")]) expect(decodeMessage(bytes)).toBeNull();
});
