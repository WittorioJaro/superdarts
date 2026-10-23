import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { normalizeTableCode, TABLE_CODE_LENGTH } from "./pub-table-types";
import { generateCode, hashToken } from "./pub-table-token";

describe("pub table codes and tokens", () => {
  it("normalizes case, whitespace and dashes without hiding invalid characters", () => {
    expect(normalizeTableCode(" \tabc-\nde2 \r")).toBe("ABCDE2");
    expect(normalizeTableCode("ab!c01")).toBe("AB!C01");
    expect(normalizeTableCode("")).toBe("");
  });

  it("generates six characters from the unambiguous code alphabet", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateCode();
      expect(code).toHaveLength(TABLE_CODE_LENGTH);
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  it("hashes tokens deterministically with SHA-256", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashToken("table-token")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("table-token")).toBe(hashToken("table-token"));
    expect(hashToken("other-token")).not.toBe(hashToken("table-token"));
  });
});
