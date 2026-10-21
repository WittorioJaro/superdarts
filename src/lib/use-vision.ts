"use client";

import { useMaybeRoomContext } from "@livekit/components-react";
import { type RemoteParticipant, RoomEvent } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { cameraIdentity } from "./friends-types";
import { type IpadMessage, type PhoneMessage, VISION_TOPIC, decodeMessage, encodeMessage } from "./vision/protocol";

export type PhoneStatus = Extract<PhoneMessage, { kind: "status" }>;
type Handlers = {
  onDart?: (m: Extract<PhoneMessage, { kind: "dart" }>) => void;
  onTakeout?: () => void;
};

/** The phone sends status every couple of seconds; silence for longer means it's gone or asleep. */
const STALE_MS = 6000;

/**
 * Camera scoring messages from this player's own phone, over the LiveKit room the page is in.
 * Anyone in an online room can send data, so only the phone paired to `meId` is listened to.
 * Outside a LiveKit room it does nothing.
 */
export function useVision(meId: string, handlers: Handlers) {
  const room = useMaybeRoomContext();
  const [status, setStatus] = useState<PhoneStatus | null>(null);
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!room) return;
    const phone = cameraIdentity(meId);
    let stale: ReturnType<typeof setTimeout> | undefined;
    const onData = (payload: Uint8Array, from?: RemoteParticipant, _kind?: unknown, topic?: string) => {
      if (topic !== VISION_TOPIC || from?.identity !== phone) return;
      const m = decodeMessage(payload);
      if (!m) return;
      if (m.kind === "status") {
        setStatus(m);
        clearTimeout(stale);
        stale = setTimeout(() => setStatus(null), STALE_MS);
      } else if (m.kind === "dart") latest.current.onDart?.(m);
      else if (m.kind === "takeout") latest.current.onTakeout?.();
    };
    const onLeave = (p: RemoteParticipant) => p.identity === phone && setStatus(null);
    room.on(RoomEvent.DataReceived, onData);
    room.on(RoomEvent.ParticipantDisconnected, onLeave);
    return () => {
      clearTimeout(stale);
      room.off(RoomEvent.DataReceived, onData);
      room.off(RoomEvent.ParticipantDisconnected, onLeave);
    };
  }, [room, meId]);

  const send = useCallback(
    (m: IpadMessage) => {
      const bytes = encodeMessage(m);
      if (!room || !bytes) return;
      void room.localParticipant
        .publishData(new Uint8Array(bytes), { reliable: true, topic: VISION_TOPIC, destinationIdentities: [cameraIdentity(meId)] })
        .catch(() => {});
    },
    [room, meId],
  );

  return { status, send, scoring: !!status?.calibrated };
}
