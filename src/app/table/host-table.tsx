"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { addGuest } from "@/app/actions";
import { closeHostTable, createTableCode, listHostTables } from "@/app/table-actions";
import { Avatar, Sheet } from "@/components/ui";
import type { GamePlayer } from "@/lib/game-store";
import type { HostTable as OpenTable } from "@/lib/pub-table-types";

function useNow(every = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [every]);
  return now;
}

const noop = () => () => {};
/** Times and countdowns are local to the phone, so they wait for the browser rather than use the server's clock and zone. */
function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function HostTable({ players: initial, meId, open: initialOpen }: { players: GamePlayer[]; meId: string; open: OpenTable[] }) {
  const [players, setPlayers] = useState(initial);
  const [picked, setPicked] = useState<string[]>([meId]);
  const [open, setOpen] = useState(initialOpen);
  const [error, setError] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const hydrated = useHydrated();
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [guestError, setGuestError] = useState<string | null>(null);

  // The code disappears from the list once the pub's computer uses it, so keep checking while one is waiting.
  const waiting = open.some((t) => t.code);
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => void listHostTables().then(setOpen).catch(() => {}), 3000);
    return () => clearInterval(id);
  }, [waiting]);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function getCode() {
    startBusy(async () => {
      try {
        const res = await createTableCode(picked);
        if (!res.ok) return setError(res.error);
        setError(null);
        // A new code replaces any code that was never used.
        setOpen((ts) => [res.table, ...ts.filter((t) => !t.code)]);
      } catch {
        setError("Couldn't reach Superdarts. Check your connection and try again.");
      }
    });
  }

  function close(id: string) {
    startBusy(async () => {
      try {
        const res = await closeHostTable(id);
        if (!res.ok) return setError(res.error);
        setOpen((ts) => ts.filter((t) => t.id !== id));
      } catch {
        setError("Couldn't reach Superdarts. Check your connection and try again.");
      }
    });
  }

  function add() {
    startBusy(async () => {
      const res = await addGuest(guestName);
      if (!res.ok) return setGuestError(res.error);
      setPlayers((ps) => [...ps, res.player]);
      setPicked((p) => [...p, res.player.id]);
      setGuestName("");
      setGuestError(null);
      setGuestOpen(false);
    });
  }

  const pendingCode = open.find((t) => t.code);
  const live = open.filter((t) => !t.code);

  return (
    <div className="grid gap-8 pb-6 lg:grid-cols-[1.1fr_1fr]">
      <section aria-labelledby="who" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 id="who" className="font-display text-2xl font-bold">
            Who&apos;s playing
          </h2>
          <span className="text-sm text-dim">Tap in throwing order</span>
        </div>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {players.map((p) => {
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
          <li>
            <button
              type="button"
              onClick={() => setGuestOpen(true)}
              className="flex h-full min-h-[68px] w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-wire text-dim transition hover:border-dim hover:text-chalk"
            >
              <span className="text-2xl leading-none">+</span> Add player
            </button>
          </li>
        </ul>
      </section>

      <section aria-labelledby="code" className="flex flex-col gap-4">
        <h2 id="code" className="font-display text-2xl font-bold">
          Table code
        </h2>
        {pendingCode?.code ? (
          <CodeCard table={pendingCode} />
        ) : (
          <p className="text-dim">
            The code opens a table on one computer for the players you picked. Pick the format and play rematches there.
            Nothing else in Superdarts opens.
          </p>
        )}
        <button
          type="button"
          onClick={getCode}
          disabled={busy || picked.length === 0}
          className={`flex h-20 items-center justify-center rounded-2xl font-display text-3xl font-bold transition active:scale-[0.98] disabled:opacity-40 ${
            pendingCode ? "bg-felt" : "bg-double"
          }`}
        >
          {picked.length === 0 ? "Pick a player" : pendingCode ? "New code" : busy ? "Getting a code…" : "Get a code"}
        </button>
        {error && <p role="alert" className="text-double">{error}</p>}

        {live.length > 0 && (
          <div className="mt-4 flex flex-col gap-3">
            <h3 className="font-display text-xl font-bold">Open tables</h3>
            <ul className="flex flex-col gap-2">
              {live.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-4 rounded-2xl bg-cabinet px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{t.players.map((p) => p.name.split(" ")[0]).join(", ")}</span>
                    <span className="block text-sm text-dim">{t.expiresAt && hydrated ? `Open until ${time(t.expiresAt)}` : "Open"}</span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => close(t.id)}
                    className="h-11 shrink-0 rounded-xl border-2 border-double px-4 font-semibold text-double disabled:opacity-40"
                  >
                    Close
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-sm text-dim">Closing here locks the pub&apos;s computer too, in case nobody closed it there.</p>
          </div>
        )}
      </section>

      <Sheet open={guestOpen} onClose={() => setGuestOpen(false)} label="Add player">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <h2 className="font-display text-3xl font-bold">Add player</h2>
          <p className="text-dim">For friends without an account yet. Their games are saved under this name.</p>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-dim">Name</span>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              maxLength={40}
              autoFocus
              className="h-14 rounded-xl border border-wire bg-ink px-4 text-xl outline-none focus:border-chalk"
            />
          </label>
          {guestError && <p className="text-double">{guestError}</p>}
          <button
            type="submit"
            disabled={busy || !guestName.trim()}
            className="h-14 rounded-xl bg-chalk font-display text-xl font-bold text-ink disabled:opacity-40"
          >
            {busy ? "Adding…" : "Add player"}
          </button>
        </form>
      </Sheet>
    </div>
  );
}

function CodeCard({ table }: { table: OpenTable }) {
  const now = useNow();
  const hydrated = useHydrated();
  const left = Math.max(0, Math.round((new Date(table.codeExpiresAt).getTime() - now) / 1000));
  const code = table.code ?? "";
  const host = useSyncExternalStore(noop, () => window.location.host, () => "");
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl bg-cabinet p-6 text-center ring-2 ring-brass">
      <span className="text-dim">
        On the pub&apos;s computer, open <span className="font-semibold text-chalk">{host ? `${host}/t` : "/t"}</span> and type
      </span>
      <span className="font-display text-7xl leading-none font-extrabold tracking-[0.18em]">
        {code.slice(0, 3)} {code.slice(3)}
      </span>
      <span className="text-sm text-dim">
        {!hydrated ? "Works once" : left > 0 ? `Works once, for the next ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "This code has expired. Get a new one."}
      </span>
    </div>
  );
}
