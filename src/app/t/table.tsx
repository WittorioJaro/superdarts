"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { closeHostTable, closeTable, saveHostTableGame, saveTableGame } from "@/app/table-actions";
import { DEFAULT_OPTS, type GameOpts, GameOptions, cricketConfig, x01Config } from "@/components/game-options";
import { Avatar, Sheet } from "@/components/ui";
import { gameDetail } from "@/lib/darts/labels";
import { type GameStore, useActiveGame, usePendingSaves } from "@/lib/game-store";
import { SAVE_ERROR, type TableSession } from "@/lib/pub-table-types";
import { createLiveTable } from "@/lib/table-live";
import { CounterSkeleton, Play, type PlayScope } from "../play/counter";

const noop = () => () => {};
function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}

/**
 * A pub table, on the pub's computer or, with `hostTableId`, on the host's phone. Both show and score the same game:
 * a computer that's only good for showing the score can leave the scoring to the phone.
 */
export function Table({ session, logo, hostTableId }: { session: TableSession; logo: ReactNode; hostTableId?: string }) {
  const router = useRouter();
  // A new table on the same screen starts a fresh link.
  const live = useMemo(
    () =>
      createLiveTable({
        prefix: hostTableId ? `superdarts.host.${hostTableId}` : "superdarts.table",
        key: session.id,
        tableId: hostTableId,
        save: hostTableId ? (g) => saveHostTableGame(hostTableId, g) : saveTableGame,
      }),
    [session.id, hostTableId],
  );
  const scope = useMemo<PlayScope>(() => ({ store: live.store, sync: live.sync, table: true, big: !hostTableId }), [live, hostTableId]);
  useEffect(() => live.connect(), [live]);
  const status = live.useStatus();
  const game = useActiveGame(live.store);
  const hydrated = useHydrated();

  // The computer goes back to the code screen. The phone stays put and says so.
  const closed = status.closed;
  useEffect(() => {
    if (closed && !hostTableId) router.refresh();
  }, [closed, hostTableId, router]);

  useEffect(() => {
    if (!status.notice) return;
    const id = setTimeout(live.dismissNotice, 6000);
    return () => clearTimeout(id);
  }, [status.notice, live]);

  if (!hydrated) return <CounterSkeleton />;
  if (closed && hostTableId) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <h1 className="font-display text-5xl font-extrabold">Table closed</h1>
        <p className="text-lg text-dim">{closed} Finished games were saved from whichever screen ended them.</p>
        <Link href="/table" className="rounded-2xl bg-chalk px-8 py-4 font-display text-2xl font-bold text-ink">
          Back to pub tables
        </Link>
      </main>
    );
  }
  return (
    <>
      {game ? (
        <Play key={game.id} game={game} scope={scope} />
      ) : (
        <Setup session={session} logo={logo} store={live.store} sync={scope.sync} hostTableId={hostTableId} />
      )}
      {status.notice && (
        <p role="status" className="fixed inset-x-0 bottom-6 z-30 mx-auto w-fit max-w-[90vw] rounded-2xl bg-brass px-5 py-3 font-semibold text-ink shadow-xl">
          {status.notice}
        </p>
      )}
    </>
  );
}

function Setup({
  session,
  logo,
  store: tableStore,
  sync,
  hostTableId,
}: {
  session: TableSession;
  logo: ReactNode;
  store: GameStore;
  sync: PlayScope["sync"];
  hostTableId?: string;
}) {
  const router = useRouter();
  const pending = usePendingSaves(tableStore);
  const [picked, setPicked] = useState<string[]>(() => tableStore.prefs("picked", session.players.map((p) => p.id)));
  const [opts, setOpts] = useState<GameOpts>(() => ({ ...DEFAULT_OPTS, ...tableStore.prefs<Partial<GameOpts>>("opts", {}) }));
  const [saveError, setSaveError] = useState(() => tableStore.prefs<string | null>(SAVE_ERROR, null));
  const [closing, setClosing] = useState(false);

  const flush = useCallback(async () => {
    const res = await sync();
    // The host may have closed the table from their phone; the page then goes back to the code screen.
    if (res.errors.length) {
      setSaveError(res.errors[0]);
      tableStore.setPref(SAVE_ERROR, res.errors[0]);
      router.refresh();
    }
  }, [router, sync, tableStore]);

  useEffect(() => {
    // Shown once: the message is in state now, so the store doesn't need it.
    tableStore.setPref(SAVE_ERROR, null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [flush, tableStore]);

  const lineup = picked.map((id) => session.players.find((p) => p.id === id)!).filter(Boolean);
  const config = x01Config(opts);
  const cricket = cricketConfig(opts);
  const canRank = opts.game === "x01" && opts.startScore === 501 && lineup.length >= 2;

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function start() {
    tableStore.setPref("picked", picked);
    tableStore.setPref("opts", opts);
    if (opts.game === "cricket") tableStore.start({ kind: "match", mode: "cricket", config: cricket, players: lineup, ranked: false });
    else tableStore.start({ kind: "match", mode: "x01", config, players: lineup, ranked: canRank && opts.ranked });
  }

  const until = new Date(session.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <main className="safe-top safe-bottom mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 pb-10 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <div className="flex items-center gap-3">
          {logo}
          <div>
            <h1 className="font-display text-3xl leading-none font-extrabold tracking-tight">Pub table</h1>
            <p className="text-sm text-dim">
              {hostTableId
                ? `Scoring from your phone. The pub's computer shows the same game. Open until ${until}.`
                : `Opened by ${session.hostName.split(" ")[0]}. Open until ${until} or until you close it. Scores can also come from ${session.hostName.split(" ")[0]}'s phone.`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setClosing(true)}
          className="h-12 rounded-xl border-2 border-double px-5 font-display text-xl font-bold text-double transition hover:bg-double/10"
        >
          Close table
        </button>
      </header>

      {saveError && (
        <p role="alert" className="rounded-2xl border border-double/40 bg-double/10 px-5 py-3">
          A game couldn&apos;t be saved: {saveError}
        </p>
      )}
      {pending.length > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-cabinet px-5 py-3">
          <span>
            {pending.length === 1 ? "1 game is" : `${pending.length} games are`} waiting to be saved. They&apos;ll go up
            when the connection is back.
          </span>
          <button type="button" onClick={flush} className="shrink-0 rounded-xl bg-felt px-4 py-2 font-semibold hover:bg-wire">
            Save now
          </button>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <section aria-labelledby="who" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 id="who" className="font-display text-2xl font-bold">
              Who&apos;s playing
            </h2>
            <span className="text-sm text-dim">Tap in throwing order</span>
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {session.players.map((p) => {
              const order = picked.indexOf(p.id);
              const on = order >= 0;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(p.id)}
                    className={`relative flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition active:scale-[0.98] ${
                      on ? "border-chalk bg-felt" : "border-transparent bg-cabinet hover:bg-felt"
                    }`}
                  >
                    <Avatar name={p.name} color={p.color} url={p.avatarUrl} size={44} />
                    <span className="min-w-0 flex-1 truncate text-lg font-semibold">{p.name}</span>
                    {on && (
                      <span
                        aria-label={`Throws ${order + 1}${["st", "nd", "rd"][order] ?? "th"}`}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chalk font-display text-lg font-bold text-ink"
                      >
                        {order + 1}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-sm text-dim">
            Every dart counts on these players&apos; profiles. To add someone, close the table and make a new code.
          </p>
        </section>

        <section aria-labelledby="format" className="flex flex-col gap-6">
          <h2 id="format" className="font-display text-2xl font-bold">
            Game
          </h2>
          <GameOptions
            opts={opts}
            onChange={setOpts}
            canRank={canRank}
            rankHint={canRank ? "Counts towards everyone's 501 rating." : "Ratings are for 501 with two or more players."}
          />
          <button
            type="button"
            onClick={start}
            disabled={lineup.length === 0}
            className="mt-2 flex h-20 flex-col items-center justify-center rounded-2xl bg-double transition active:scale-[0.98] disabled:opacity-40"
          >
            <span className="font-display text-3xl leading-none font-bold">
              {lineup.length === 0 ? "Pick a player" : `Start ${opts.game === "cricket" ? "Cricket" : opts.startScore}`}
            </span>
            {lineup.length > 0 && (
              <span className="mt-1 text-sm text-chalk/80">
                {opts.game === "cricket" ? gameDetail("cricket", cricket as never) : gameDetail("x01", config as never)}
              </span>
            )}
          </button>
        </section>
      </div>

      <Sheet open={closing} onClose={() => setClosing(false)} label="Close table">
        <CloseTable onCancel={() => setClosing(false)} store={tableStore} sync={sync} hostTableId={hostTableId} />
      </Sheet>
    </main>
  );
}

function CloseTable({
  onCancel,
  store: tableStore,
  sync,
  hostTableId,
}: {
  onCancel: () => void;
  store: GameStore;
  sync: PlayScope["sync"];
  hostTableId?: string;
}) {
  const router = useRouter();
  const pending = usePendingSaves(tableStore);
  const [busy, startClosing] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function close() {
    startClosing(async () => {
      // Saved games must reach the server before this device loses the right to send them.
      await sync().catch(() => null);
      if (tableStore.pending().length > 0 && !window.confirm("Some games haven't been saved and will be lost. Close anyway?")) return;
      try {
        const res = hostTableId ? await closeHostTable(hostTableId) : await closeTable();
        if (!res.ok) return setError(res.error);
      } catch {
        return setError("Couldn't reach Superdarts, so the table is still open. Check the connection and try again.");
      }
      tableStore.clear();
      if (hostTableId) router.push("/table");
      else router.refresh();
    });
  }

  const btn = "h-16 w-full rounded-2xl font-display text-2xl font-bold transition active:scale-[0.98] disabled:opacity-40";
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-3xl font-bold">Close the table?</h2>
      <p className="mb-2 text-dim">
        {hostTableId
          ? "Finished games are saved first. After that the pub's computer is locked again, and scoring there takes a new code."
          : "Finished games are saved first. After that this computer is locked again, and scoring here takes a new code."}
        {pending.length > 0 && ` ${pending.length === 1 ? "1 game is" : `${pending.length} games are`} still waiting to be saved.`}
      </p>
      {error && <p className="text-double">{error}</p>}
      <button type="button" disabled={busy} onClick={close} className={`${btn} bg-double`}>
        {busy ? "Closing…" : "Close table"}
      </button>
      <button type="button" disabled={busy} onClick={onCancel} className={`${btn} text-dim`}>
        Keep playing
      </button>
    </div>
  );
}
