"use client";

import { useState, useTransition } from "react";
import { Avatar, Sheet } from "@/components/ui";
import { deletePlayer, renamePlayer } from "./player-actions";

type Row = { id: string; name: string; color: string; avatarUrl: string | null; userId: string | null; games: number };

export function PlayerList({ players, meId }: { players: Row[]; meId: string }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const button = "h-11 rounded-xl bg-felt px-4 font-medium hover:bg-wire disabled:opacity-50";

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) {
    setError(null);
    setMessage(null);
    start(async () => {
      try {
        const result = await action();
        if (!result.ok) return setError(result.error);
        setEditing(null);
        setMessage(done);
      } catch {
        setError("Couldn't save that. Try again.");
      }
    });
  }

  const groups = [
    { title: "Accounts", rows: players.filter((p) => p.userId) },
    { title: "Guests", rows: players.filter((p) => !p.userId) },
  ].filter((g) => g.rows.length);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="h-11 rounded-xl bg-cabinet px-4 font-medium hover:bg-felt">
        Players
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} label="Players">
        <div className="flex max-h-[80dvh] flex-col gap-5 overflow-y-auto">
          <div>
            <h2 className="font-display text-3xl font-bold">Players</h2>
            <p className="text-dim">Rename anyone, or delete a player who hasn&apos;t saved a game. Guests never appear in the player list.</p>
          </div>
          {error && <p role="alert" className="text-double">{error}</p>}
          {message && <p role="status" className="text-sm text-dim">{message}</p>}
          {groups.map((g) => (
            <section key={g.title} className="flex flex-col gap-3">
              <h3 className="text-sm font-medium text-dim">{g.title}</h3>
              <ul className="flex flex-col gap-3">
                {g.rows.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3">
                    <Avatar name={p.name} color={p.color} url={p.avatarUrl} size={36} />
                    {editing === p.id ? (
                      <form className="flex min-w-0 flex-1 flex-wrap gap-2" onSubmit={(e) => {
                        e.preventDefault();
                        run(() => renamePlayer(p.id, name), `Renamed to ${name.trim()}.`);
                      }}>
                        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus aria-label={`New name for ${p.name}`}
                          className="h-11 min-w-0 flex-1 rounded-xl border border-wire bg-ink px-3 text-lg outline-none focus:border-chalk" />
                        <button disabled={pending || !name.trim()} className={button}>Save</button>
                        <button type="button" className={button} onClick={() => setEditing(null)}>Cancel</button>
                      </form>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{p.name}{p.id === meId && <span className="ml-2 text-sm font-normal text-dim">you</span>}</span>
                          <span className="block text-sm text-dim">{p.games === 1 ? "1 game" : `${p.games} games`}</span>
                        </span>
                        <button type="button" className={button} disabled={pending} aria-label={`Rename ${p.name}`} onClick={() => {
                          setEditing(p.id);
                          setName(p.name);
                        }}>Rename</button>
                        {p.id !== meId && p.games === 0 && (
                          <button type="button" className={button} disabled={pending} aria-label={`Delete ${p.name}`} onClick={() => {
                            if (window.confirm(`Delete ${p.name}?`)) run(() => deletePlayer(p.id), `Deleted ${p.name}.`);
                          }}>Delete</button>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Sheet>
    </>
  );
}
