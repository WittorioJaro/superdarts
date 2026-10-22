import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ invite: vi.fn(), claims: vi.fn() }));
vi.mock("@/db", () => ({ db: { query: { invites: { findFirst: mocks.invite } } } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: mocks.claims } }) }));
import { getCurrentAdmin, isAdminEmail, isEmailAllowed } from "./auth";

beforeEach(() => {
  vi.stubEnv("ALLOWED_EMAILS", " friend@gmail.com, OTHER@gmail.com ");
  vi.stubEnv("ADMIN_EMAILS", " ADMIN@gmail.com, second@gmail.com ");
  mocks.invite.mockReset().mockResolvedValue(undefined);
  mocks.claims.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("email access", () => {
  it("keeps empty lists open without querying invites", async () => {
    vi.stubEnv("ALLOWED_EMAILS", " , ");
    expect(await isEmailAllowed("any@gmail.com")).toBe(true);
    expect(mocks.invite).not.toHaveBeenCalled();
  });
  it("allows admins and listed emails without querying invites", async () => {
    expect(isAdminEmail("admin@GMAIL.com")).toBe(true);
    expect(isAdminEmail(undefined)).toBe(false);
    expect(await isEmailAllowed("ADMIN@gmail.com")).toBe(true);
    expect(await isEmailAllowed("OTHER@gmail.com")).toBe(true);
    expect(mocks.invite).not.toHaveBeenCalled();
  });
  it("allows invited users and denies missing or revoked invites", async () => {
    mocks.invite.mockResolvedValueOnce({ email: "invited@gmail.com" });
    expect(await isEmailAllowed("Invited@gmail.com")).toBe(true);
    expect(await isEmailAllowed("invited@gmail.com")).toBe(false);
    expect(await isEmailAllowed(undefined)).toBe(false);
  });
  it("does not grant admin privileges to regular signed-in users", async () => {
    mocks.claims.mockResolvedValue({ data: { claims: { sub: "user", email: "friend@gmail.com" } } });
    expect(await getCurrentAdmin()).toBeNull();
  });
});
