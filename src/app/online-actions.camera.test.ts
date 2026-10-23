import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  currentPlayer: vi.fn(), lookup: vi.fn(), transaction: vi.fn(), grants: [] as Record<string, unknown>[], identities: [] as string[],
  me: { id: "0aad6019-1b27-49c6-822e-8aad8664d585", name: "Player", color: "#fff", avatarUrl: null },
  room: { id: "cc340178-be6c-4ac8-a361-a78b8b975940", status: "playing", code: "ABCD" },
}));
vi.mock("@/lib/auth", () => ({ getCurrentPlayer: mocks.currentPlayer }));
vi.mock("@/db", () => ({ db: { select: () => ({ from: () => ({ where: mocks.lookup }) }), transaction: mocks.transaction } }));
vi.mock("@/db/schema", () => ({ players: { id: "player-id" }, rooms: { id: "room-id" }, roomPlayers: { roomId: "room-id", position: "position" }, games: {}, roomDarts: {} }));
vi.mock("@/lib/camera-token", () => import("../lib/camera-token"));
vi.mock("@/lib/friends-types", () => import("../lib/friends-types"));
vi.mock("@/lib/darts/labels", () => ({}));
vi.mock("@/lib/darts/modes", () => import("../lib/darts/modes"));
vi.mock("@/lib/darts/rooms", () => ({}));
vi.mock("@/lib/darts/schemas", () => import("../lib/darts/schemas"));
vi.mock("@/lib/persist-game", () => ({}));
vi.mock("@/lib/rooms", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("livekit-server-sdk", () => ({
  TrackSource: { MICROPHONE: "microphone", CAMERA: "camera" },
  AccessToken: class {
    constructor(_key: string, _secret: string, options: { identity: string }) { mocks.identities.push(options.identity); }
    addGrant(grant: Record<string, unknown>) { mocks.grants.push(grant); }
    async toJwt() { return "test-jwt"; }
  },
}));
import { cameraLink, cameraToken } from "./online-actions";

beforeEach(() => {
  vi.stubEnv("LIVEKIT_URL", "wss://livekit.test"); vi.stubEnv("LIVEKIT_API_KEY", "key"); vi.stubEnv("LIVEKIT_API_SECRET", "secret");
  mocks.grants.length = 0; mocks.identities.length = 0; mocks.lookup.mockReset(); mocks.transaction.mockReset();
  mocks.currentPlayer.mockReset().mockResolvedValue(mocks.me);
  mocks.lookup.mockResolvedValue([mocks.me]);
  mocks.transaction.mockImplementation(async (action) => action({ select: () => ({ from: (table: unknown) => ({
    where: () => ({
      for: async () => [mocks.room],
      orderBy: async () => [{ playerId: mocks.me.id }],
      then: (resolve: (value: unknown) => unknown) => resolve(table && [mocks.me]),
    }),
  }) }) }));
});

describe("camera server actions", () => {
  it("checks room membership and lets the phone publish only its camera and mic", async () => {
    const link = await cameraLink(mocks.room.id); expect(link.ok).toBe(true);
    if (!link.ok) return;
    expect(await cameraToken(link.path.slice("/cam/".length))).toMatchObject({ ok: true, roomCode: mocks.room.code });
    expect(mocks.grants[0]).toMatchObject({ room: `superdarts-${mocks.room.id}`, canPublishData: false });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });
  it("rejects an invalid camera link before minting grants", async () => {
    expect((await cameraToken("malformed")).ok).toBe(false);
    expect(mocks.grants).toHaveLength(0);
  });
});
