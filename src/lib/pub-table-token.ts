import "server-only";
import { createHash, randomInt } from "node:crypto";
import { TABLE_CODE_LENGTH } from "./pub-table-types";

export const TABLE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateCode(): string {
  return Array.from({ length: TABLE_CODE_LENGTH }, () => TABLE_CODE_ALPHABET[randomInt(TABLE_CODE_ALPHABET.length)]).join("");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
