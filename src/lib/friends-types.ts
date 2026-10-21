import type { GamePlayer } from "./game-store";

/** What a signed-in friend is doing right now, from the page they're on. */
export type Activity = "home" | "practice" | "match" | "room" | "stats";

export interface FriendPresence extends GamePlayer {
  activity: Activity;
  /** When they arrived at this activity, ms since epoch. */
  since: number;
}

/** "Come and play": sent to one player's private channel `player:<playerId>`. */
export interface RoomInvite {
  id: string;
  code: string;
  from: GamePlayer;
  /** e.g. "501, first to 3 legs". */
  title: string;
  sentAt: number;
}

export interface FriendsConnection {
  /** Everyone else signed in with the app open, sorted by name. One entry per player even with several devices. */
  online: FriendPresence[];
  /** Invites received while the app was open, newest first. */
  invites: RoomInvite[];
  dismiss(id: string): void;
  connected: boolean;
}

/** A phone joining a room as someone's board camera, without signing in. */
export interface CameraLink {
  /** Path to open on the phone, e.g. `/cam/<token>`. */
  path: string;
  expiresAt: string;
}

export interface CameraSession {
  url: string;
  token: string;
  roomCode: string | null;
  player: GamePlayer;
}

/** LiveKit identity of a player's phone camera. The iPad keeps the plain player id. */
export const cameraIdentity = (playerId: string) => `${playerId}:cam`;
/** The player a LiveKit identity belongs to, phone or iPad. */
export const identityPlayer = (identity: string) => identity.split(":")[0];

/** LiveKit participant attribute on the iPad saying which device should send this player's voice. */
export type MicSource = "off" | "ipad" | "phone";
export const MIC_ATTRIBUTE = "mic";
