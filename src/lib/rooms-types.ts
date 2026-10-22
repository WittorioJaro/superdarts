import type { Dart } from "./darts/board";
import type { ConfigMap } from "./darts/modes";
import type { GamePlayer } from "./game-store";

/**
 * Online rooms: friends on different devices play one game. The game is the
 * same ordered dart list the counter already replays; the room only syncs it.
 */

export type RoomMode = "x01" | "cricket";

export type RoomSettings =
  | { mode: "x01"; config: ConfigMap["x01"]; ranked: boolean }
  | { mode: "cricket"; config: ConfigMap["cricket"]; ranked: false };

/** `lobby` waiting for players, `playing` a game is on (or just finished), `closed` by the host. */
export type RoomStatus = "lobby" | "playing" | "closed";

export interface RoomPlayer extends GamePlayer {
  /** Throwing order in the current game, 0 first. */
  position: number;
}

export interface RoomSnapshot {
  id: string;
  code: string;
  hostId: string;
  status: RoomStatus;
  settings: RoomSettings;
  /** In throwing order. */
  players: RoomPlayer[];
  /** The current game. Null in the lobby. Its id is the id the game is saved under. */
  game: {
    id: string;
    startedAt: string;
    /** `darts[i]` has seq `i`. Contiguous, oldest first. */
    darts: Dart[];
    /** Saved to stats. No more darts or undos after this. */
    saved: boolean;
  } | null;
}

/** Room list entry on the Online page. */
export interface RoomSummary {
  code: string;
  status: RoomStatus;
  settings: RoomSettings;
  players: GamePlayer[];
  hostId: string;
  updatedAt: string;
}

export type RoomActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Realtime broadcast events on the private channel `room:<roomId>`. */
export type RoomEvent =
  | { type: "dart"; gameId: string; seq: number; dart: Dart }
  | { type: "undo"; gameId: string; seq: number }
  /** Anything else changed (players, status, new game, saved). Refetch the snapshot. */
  | { type: "room" };

/** What `useRoom` gives the UI. */
export interface RoomConnection {
  /** Server snapshot with this device's not-yet-confirmed darts applied on top. */
  room: RoomSnapshot;
  /** Player ids with the room open right now. */
  online: ReadonlySet<string>;
  connected: boolean;
  /** Darts thrown here that the server hasn't confirmed yet. */
  pending: number;
  /** Last rejected action, in plain words. Cleared on the next successful one. */
  error: string | null;
  /** False when it was ignored: not this player's turn, an undo in flight, or the game is over. */
  throwDart(dart: Dart): boolean;
  /** Takes back this player's last dart if it's the latest in the game. */
  undo(): void;
  refresh(): Promise<void>;
}
