"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { closeRoom, finishRoomGame, rematchRoom } from "@/app/online-actions";
import { CallerButton } from "@/components/caller-settings";
import { Pad, TotalPad } from "@/components/pad";
import { MediaControls, VideoStrip, VideoTile, useHasCamera } from "@/components/room-video";
import { Sheet } from "@/components/ui";
import { holdSessionForRoom, hush, say, useCallerSettings, warmCaller } from "@/lib/caller";
import { callsFor } from "@/lib/caller-calls";
import { isCheckoutPossible } from "@/lib/darts/checkout";
import { type Dart, visitTotal } from "@/lib/darts/board";
import { gameTitle } from "@/lib/darts/labels";
import { type StateMap, replay } from "@/lib/darts/modes";
import { type X01Config, visitTotalNeeds } from "@/lib/darts/modes/x01";
import { turnOf } from "@/lib/darts/rooms";
import { type ActiveGame, type GamePlayer, gameStore } from "@/lib/game-store";
import type { RoomConnection } from "@/lib/rooms-types";
import { Board, Flash, aimFor, headerDetail } from "@/app/play/counter";
import { Summary } from "@/app/play/summary";
import { Presence } from "./room";

/** After the last dart, the game saves itself unless someone undoes it first. */
const AUTOSAVE_MS = 20_000;

export function OnlineGame({ conn, me }: { conn: RoomConnection; me: GamePlayer }) {
  const router = useRouter();
  const { room, online } = conn;
  const live = room.game!;
  const players = room.players;
  const game: ActiveGame = useMemo(
    () => ({
      id: live.id,
      kind: "match",
      ranked: room.settings.ranked,
      mode: room.settings.mode,
      config: room.settings.config,
      players,
      darts: live.darts,
      startedAt: live.startedAt,
    }),
    [live, room.settings, players],
  );
  const state = useMemo(() => replay(game.mode, game.config as never, players.length, game.darts), [game, players.length]);
  const myIndex = players.findIndex((p) => p.id === me.id);
  const thrower = state.finished ? null : players[state.current];
  const myTurn = !state.finished && state.current === myIndex;

  // Who threw the latest dart decides whether this device may undo it.
  const lastBy = useMemo(() => {
    if (game.darts.length === 0) return null;
    return turnOf(game.mode, game.config as never, players.length, game.darts.slice(0, -1));
  }, [game, players.length]);
  const canUndo = !live.saved && lastBy === myIndex;

  // Big "180" / "Bust" calls for everyone's darts, but not when one is taken back.
  const [seen, setSeen] = useState(game.darts.length);
  const [flashAt, setFlashAt] = useState<number | null>(null);
  if (seen !== game.darts.length) {
    setFlashAt(game.darts.length > seen ? game.darts.length : null);
    setSeen(game.darts.length);
  }
  const ev = flashAt === game.darts.length ? state.event : null;

  // Every board hears every visit called, its own and the others'. A dart taken back silences the call.
  const called = useRef(game.darts.length);
  useEffect(() => {
    const n = game.darts.length;
    if (n > called.current) say(callsFor(game.mode, state as never, game.config as never));
    else if (n < called.current) hush();
    called.current = n;
  }, [game, state]);
  const calling = useCallerSettings().on;
  useEffect(() => {
    if (!calling) return;
    if (called.current === 0) say(["game-on"]);
    const stop = warmCaller();
    return () => {
      stop();
      hush();
    };
  }, [calling, live.id]);
  useEffect(() => holdSessionForRoom(), []);
  const flash = ev && ev.type !== "hit" && ev.type !== "match" ? ev : null;

  const [menu, setMenu] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [entry, setEntry] = useState<"darts" | "total">(() => (game.mode === "x01" ? gameStore.prefs("entry", "darts") : "darts"));
  const [busy, startBusy] = useTransition();
  const [doing, setDoing] = useState<"rematch" | "leave" | "close" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function act(what: NonNullable<typeof doing>, fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setDoing(what);
    startBusy(async () => {
      try {
        const res = await fn();
        if (!res.ok) return setActionError(res.error ?? "Something went wrong.");
        setActionError(null);
        if (after) after();
        else await conn.refresh();
      } catch {
        setActionError("Couldn't reach the server. Check your connection and try again.");
      }
    });
  }

  // Save a finished game even if nobody taps anything. Devices take turns by seat, so usually one request does it and the
  // rest see `saved` arrive and stand down; a later seat still saves if the earlier one dropped out.
  const finished = state.finished && !live.saved && conn.pending === 0;
  const seat = Math.max(0, players.findIndex((p) => p.id === me.id));
  const { refresh } = conn;
  useEffect(() => {
    if (!finished) return;
    const id = setTimeout(() => void finishRoomGame(room.id).then(refresh).catch(() => {}), AUTOSAVE_MS + seat * 4000);
    return () => clearTimeout(id);
  }, [finished, room.id, refresh, seat]);

  if (state.finished) {
    const others = players.filter((p) => p.id !== me.id && online.has(p.id)).map((p) => p.name.split(" ")[0]);
    return (
      <main className="safe-top safe-bottom flex flex-1 flex-col">
        <div className="flex justify-end px-5 pt-2 sm:px-8">
          <MediaControls compact />
        </div>
        <Summary
          game={game}
          state={state}
          stopped={false}
          canUndo={canUndo}
          onUndo={conn.undo}
          onAgain={() => act("rematch", () => rematchRoom(room.id))}
          onDone={() => act("leave", () => finishRoomGame(room.id), () => router.push("/online"))}
          doneLabel={busy && doing === "leave" ? "Saving…" : live.saved ? "Leave room" : "Save and leave"}
          againLabel={busy && doing === "rematch" ? "Setting up…" : "Rematch"}
          note={
            actionError ??
            (live.saved
              ? `Saved to everyone's stats.${others.length ? ` ${others.join(" and ")} ${others.length > 1 ? "are" : "is"} still here.` : ""}`
              : canUndo
                ? "Saves in a few seconds. Undo now if the last dart was wrong."
                : "Saves in a few seconds.")
          }
          plan={null}
        />
      </main>
    );
  }

  const config = game.config as unknown as Record<string, unknown>;
  const { targets, quick } = aimFor(game, state);
  const visitOpen = state.open !== null && state.turns[state.open].darts.length > 0;
  const useTotals = myTurn && game.mode === "x01" && entry === "total" && !visitOpen;

  function switchEntry(next: "darts" | "total") {
    setEntry(next);
    gameStore.setPref("entry", next);
  }

  return (
    <main className="locked safe-top safe-bottom fixed inset-0 flex flex-col gap-3 px-3 sm:px-4">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setMenu(true)}
          className="flex h-12 items-center gap-2 rounded-xl px-3 text-dim hover:bg-cabinet hover:text-chalk"
        >
          <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
          <span className="font-medium">Leave</span>
        </button>
        <p className="min-w-0 truncate text-center">
          <span className="font-display text-2xl font-bold">{gameTitle(game.mode, config)}</span>
          <span className="ml-3 hidden text-dim sm:inline">{headerDetail(game, state)}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <SyncState conn={conn} />
          <MediaControls compact />
          <CallerButton className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl hover:bg-cabinet" />
          {game.mode === "x01" && (
            <div className="flex rounded-xl bg-cabinet p-1" role="group" aria-label="Enter scores as">
              {(["darts", "total"] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-pressed={entry === e}
                  disabled={visitOpen && e === "total"}
                  onClick={() => switchEntry(e)}
                  className={`h-10 rounded-lg px-3 font-medium transition disabled:opacity-40 ${entry === e ? "bg-chalk text-ink" : "text-dim hover:text-chalk"}`}
                >
                  {e === "darts" ? "Darts" : "Total"}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-3 portrait:grid-cols-[minmax(0,1fr)] portrait:grid-rows-[minmax(0,1fr)_minmax(0,1.15fr)] landscape:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-h-0 min-w-0">
          <Board game={game} state={state} />
        </div>
        <div className="flex min-h-0 min-w-0 flex-col gap-3">
          {myTurn ? (
            <>
              <VideoStrip players={players.filter((p) => p.id !== me.id)} meId={me.id} className="h-24 shrink-0" />
              <div className="min-h-0 flex-1">
                {useTotals ? (
                  <TotalPad
                    onTotal={(total, opts) => {
                      try {
                        conn.throwDart(visitTotal(total, opts));
                      } catch {
                        // The pad only offers possible combinations.
                      }
                    }}
                    canFinish={(total, n) => isCheckoutPossible(total, n, (game.config as X01Config).out)}
                    needs={(total) => visitTotalNeeds(state as StateMap["x01"], game.config as X01Config, total)}
                    onUndo={conn.undo}
                    canUndo={canUndo}
                  />
                ) : (
                  <Pad onDart={(d: Dart) => conn.throwDart(d)} onUndo={conn.undo} canUndo={canUndo} targets={targets} quick={quick} />
                )}
              </div>
            </>
          ) : (
            thrower && <Watching thrower={thrower} here={online.has(thrower.id)} canUndo={canUndo} onUndo={conn.undo} meId={me.id} players={players} />
          )}
        </div>
      </div>

      {conn.error && (
        <p role="alert" className="pointer-events-none fixed inset-x-0 bottom-6 z-30 mx-auto w-fit rounded-2xl bg-double px-5 py-3 font-semibold shadow-xl">
          {conn.error}
        </p>
      )}

      {flash && <Flash key={game.darts.length} event={flash} game={game} />}

      <Sheet open={menu} onClose={() => setMenu(false)} label="Leave the room">
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-3xl font-bold">Leave the room?</h2>
          <p className="mb-2 text-dim">
            The game stays open. Come back from Online or the invite link and carry on where you left off.
          </p>
          <button type="button" onClick={() => router.push("/online")} className="h-16 w-full rounded-2xl bg-chalk font-display text-2xl font-bold text-ink">
            Leave for now
          </button>
          <button
            type="button"
            onClick={() =>
              void navigator.clipboard.writeText(`${window.location.origin}/r/${room.code}`).then(() => {
                setLinkCopied(true);
                setTimeout(() => setLinkCopied(false), 2000);
              })
            }
            className="h-14 w-full rounded-2xl bg-felt font-semibold hover:bg-wire"
          >
            {linkCopied ? "Copied" : `Copy room link (${room.code})`}
          </button>
          {room.hostId === me.id && (
            <button
              type="button"
              disabled={busy}
              onClick={() => act("close", () => closeRoom(room.id), () => router.push("/online"))}
              className="h-16 w-full rounded-2xl border-2 border-double font-display text-2xl font-bold text-double"
            >
              Close the room
            </button>
          )}
          {actionError && <p className="text-double">{actionError}</p>}
          <button type="button" onClick={() => setMenu(false)} className="h-16 w-full rounded-2xl font-display text-2xl font-bold text-dim">
            Keep playing
          </button>
        </div>
      </Sheet>
    </main>
  );
}

/** While someone else throws: their camera big, so you can watch the darts land. */
function Watching({
  thrower,
  here,
  canUndo,
  onUndo,
  meId,
  players,
}: {
  thrower: GamePlayer;
  here: boolean;
  canUndo: boolean;
  onUndo: () => void;
  meId: string;
  players: GamePlayer[];
}) {
  const camera = useHasCamera(thrower.id);
  const name = thrower.name.split(" ")[0];
  const status = (
    <div className="flex flex-col items-center gap-2 text-center">
      <span className="font-display text-4xl font-bold">{name} is throwing…</span>
      {!here && <span className="text-dim">{name} isn&apos;t connected right now. The game carries on when they&apos;re back.</span>}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {camera ? (
        <VideoTile player={thrower} className="min-h-0 flex-1">
          <span className="absolute top-3 left-3 flex items-center gap-3 rounded-xl bg-ink/70 px-3 py-1.5 font-display text-2xl font-bold backdrop-blur">
            {name} is throwing
            <Presence here={here} />
          </span>
        </VideoTile>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-3xl bg-cabinet p-6">{status}</div>
      )}
      <div className="flex shrink-0 items-center gap-3">
        <VideoStrip players={players.filter((p) => p.id !== thrower.id)} meId={meId} className="h-20 min-w-0 flex-1 overflow-x-auto" />
        {canUndo && (
          <button type="button" onClick={onUndo} className="ml-auto h-14 rounded-2xl bg-felt px-6 text-lg font-semibold text-dim hover:text-chalk">
            Undo your last dart
          </button>
        )}
      </div>
    </div>
  );
}

function SyncState({ conn }: { conn: RoomConnection }) {
  if (!conn.connected) {
    return <span className="rounded-full bg-double/20 px-3 py-1 text-sm font-semibold text-double">Reconnecting…</span>;
  }
  if (conn.pending > 0) {
    return <span className="rounded-full bg-felt px-3 py-1 text-sm font-semibold text-dim">Sending…</span>;
  }
  return null;
}
