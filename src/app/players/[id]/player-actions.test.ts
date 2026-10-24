import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ admin: vi.fn(), update: vi.fn(), transaction: vi.fn(), found: vi.fn(), count: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentAdmin: mocks.admin }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db", () => {
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ for: mocks.found }) }) }),
    $count: mocks.count,
    delete: () => ({ where: mocks.remove }),
    transaction: (fn: (t: unknown) => unknown) => fn(tx),
  };
  mocks.transaction.mockImplementation((fn: (t: unknown) => unknown) => fn(tx));
  return { db: { transaction: mocks.transaction, update: () => ({ set: () => ({ where: () => ({ returning: mocks.update }) }) }) } };
});
import { deletePlayer, renamePlayer } from "./player-actions";

const ADMIN = "00000000-0000-4000-8000-000000000001";
const GUEST = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ id: ADMIN });
  mocks.found.mockResolvedValue([{ id: GUEST }]);
  mocks.count.mockResolvedValue(0);
  mocks.update.mockResolvedValue([{ id: GUEST }]);
});

it("rejects non-admins before touching the database", async () => {
  mocks.admin.mockResolvedValue(null);
  expect((await renamePlayer(GUEST, "Dad")).ok).toBe(false);
  expect((await deletePlayer(GUEST)).ok).toBe(false);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("validates input and refuses to delete the admin", async () => {
  expect((await renamePlayer(GUEST, "  ")).ok).toBe(false);
  expect((await renamePlayer("nope", "Dad")).ok).toBe(false);
  expect((await deletePlayer(ADMIN)).ok).toBe(false);
  expect(mocks.transaction).not.toHaveBeenCalled();
});

it("keeps players who have saved games", async () => {
  mocks.count.mockResolvedValueOnce(3);
  expect(await deletePlayer(GUEST)).toEqual({ ok: false, error: "They've played 3 saved games, so they can't be deleted." });
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("keeps players on a live pub table", async () => {
  mocks.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
  expect(await deletePlayer(GUEST)).toEqual({ ok: false, error: "They're on an open pub table. Close it first." });
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("deletes a player without history, with their dead tables, and reports foreign key conflicts", async () => {
  expect(await deletePlayer(GUEST)).toEqual({ ok: true });
  expect(mocks.remove).toHaveBeenCalledTimes(2);
  mocks.remove.mockRejectedValueOnce(Object.assign(new Error("query failed"), { cause: { code: "23503" } }));
  expect((await deletePlayer(GUEST)).ok).toBe(false);
});
