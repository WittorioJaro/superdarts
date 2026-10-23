import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ admin: vi.fn(), insert: vi.fn(), values: vi.fn(), conflict: vi.fn(), remove: vi.fn(), where: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentAdmin: mocks.admin }));
vi.mock("@/db", () => ({ db: { insert: mocks.insert, delete: mocks.remove } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { inviteEmail, revokeInvite } from "./invite-actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ id: "admin-id" });
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockReturnValue({ onConflictDoNothing: mocks.conflict });
  mocks.remove.mockReturnValue({ where: mocks.where });
});

it("rejects both mutations for non-admins before touching the database", async () => {
  mocks.admin.mockResolvedValue(null);
  expect((await inviteEmail("friend@gmail.com")).ok).toBe(false);
  expect((await revokeInvite("friend@gmail.com")).ok).toBe(false);
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("rejects malformed input on the server", async () => {
  for (const input of [null, {}, "bad", "bad@", "a@b.com\nother@gmail.com"]) {
    expect((await inviteEmail(input)).ok).toBe(false);
    expect((await revokeInvite(input)).ok).toBe(false);
  }
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("normalizes invites and ignores duplicate insert conflicts", async () => {
  expect(await inviteEmail(" Friend@GMAIL.com ")).toEqual({ ok: true });
  expect(mocks.values).toHaveBeenCalledWith({ email: "friend@gmail.com", invitedBy: "admin-id" });
  expect(mocks.conflict).toHaveBeenCalledOnce();
  expect(await revokeInvite(" Friend@GMAIL.com ")).toEqual({ ok: true });
  expect(mocks.where).toHaveBeenCalledOnce();
});
