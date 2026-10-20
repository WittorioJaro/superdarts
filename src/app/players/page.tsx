import Link from "next/link";
import { Avatar, BackLink } from "@/components/ui";
import { getCurrentPlayer } from "@/lib/auth";
import { fmtAvg } from "@/lib/darts/stats";
import { listPlayers, playerSummaries } from "@/lib/queries";

export default async function PlayersPage() {
  const me = await getCurrentPlayer();
  const [players, summaries] = await Promise.all([listPlayers(), playerSummaries()]);
  const byId = new Map(summaries.map((s) => [s.playerId, s]));

  return (
    <main className="safe-top safe-bottom mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-5 sm:px-8">
      <header className="flex flex-col gap-1 pt-2">
        <BackLink />
        <h1 className="font-display text-5xl font-extrabold tracking-tight">Players</h1>
      </header>
      <ul className="divide-y divide-wire overflow-hidden rounded-3xl bg-cabinet">
        {players.map((p) => {
          const s = byId.get(p.id);
          return (
            <li key={p.id}>
              <Link href={`/players/${p.id}`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-felt">
                <Avatar name={p.name} color={p.color} url={p.avatarUrl} size={48} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xl font-semibold">
                    {p.name}
                    {p.id === me.id && <span className="ml-2 text-base font-normal text-dim">you</span>}
                  </span>
                  <span className="block text-dim">
                    {s ? `${s.games} ${s.games === 1 ? "game" : "games"}, ${s.wins} match ${s.wins === 1 ? "win" : "wins"}` : "No games yet"}
                    {!p.userId && ", guest"}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-display text-3xl font-bold">{fmtAvg(s?.average)}</span>
                  <span className="block text-sm text-dim">average</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
