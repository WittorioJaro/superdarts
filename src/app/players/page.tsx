import Link from "next/link";
import { Avatar, BackLink } from "@/components/ui";
import { getCurrentPlayer } from "@/lib/auth";
import { fmtAvg, fmtPct } from "@/lib/darts/stats";
import { type StatsRange, leaderboard } from "@/lib/queries";

export default async function PlayersPage({ searchParams }: PageProps<"/players">) {
  const sp = await searchParams;
  const range: StatsRange = sp.range === "30d" ? "30d" : "all";
  const [me, rows] = await Promise.all([getCurrentPlayer(), leaderboard(range)]);

  const head = "px-3 py-3 text-right text-sm font-medium text-dim";
  const cell = "px-3 py-3 text-right font-display text-2xl font-semibold";

  return (
    <main className="safe-top safe-bottom mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 pb-10 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4 pt-2">
        <div className="flex flex-col gap-1">
          <BackLink />
          <h1 className="font-display text-5xl font-extrabold tracking-tight">Players</h1>
        </div>
        <nav aria-label="Time range" className="flex gap-2">
          {(
            [
              ["all", "All time"],
              ["30d", "Last 30 days"],
            ] as const
          ).map(([v, label]) => (
            <Link
              key={v}
              href={v === "all" ? "/players" : "/players?range=30d"}
              scroll={false}
              aria-current={range === v ? "true" : undefined}
              className={`flex h-11 items-center rounded-xl px-4 font-medium transition ${range === v ? "bg-chalk text-ink" : "bg-cabinet hover:bg-felt"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="overflow-x-auto rounded-3xl bg-cabinet">
        <table className="w-full">
          <caption className="sr-only">Leaderboard. Ratings come from ranked 501 matches; the other numbers from all matches.</caption>
          <thead>
            <tr className="border-b border-wire">
              <th scope="col" className="w-10 px-4 py-3 text-left text-sm font-medium text-dim">
                #
              </th>
              <th scope="col" className="px-3 py-3 text-left text-sm font-medium text-dim">
                Player
              </th>
              <th scope="col" className={head}>
                Rating
              </th>
              <th scope="col" className={head}>
                Average
              </th>
              <th scope="col" className={`${head} hidden md:table-cell`}>
                First 9
              </th>
              <th scope="col" className={`${head} hidden md:table-cell`}>
                Checkout
              </th>
              <th scope="col" className={`${head} hidden lg:table-cell`}>
                Best out
              </th>
              <th scope="col" className={`${head} hidden sm:table-cell`}>
                180s
              </th>
              <th scope="col" className={`${head} pr-5`}>
                Won
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.playerId} className="border-b border-wire/60 transition last:border-0 hover:bg-felt">
                <td className="px-4 py-3 font-display text-xl text-dim">{i + 1}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={r.name} color={r.color} url={r.avatarUrl} size={40} />
                    <span className="min-w-0">
                      <Link href={`/players/${r.playerId}`} className="block truncate text-lg font-semibold hover:underline">
                        {r.name}
                        {r.playerId === me.id && <span className="ml-2 text-sm font-normal text-dim">you</span>}
                      </Link>
                      {r.playerId !== me.id && (
                        <Link href={`/players/${me.id}/vs/${r.playerId}`} className="block text-sm text-dim hover:text-chalk">
                          Head to head
                        </Link>
                      )}
                    </span>
                  </div>
                </td>
                <td className={cell} title={r.rd !== null ? `± ${Math.round(r.rd * 2)}` : "Not rated yet"}>
                  {r.rating !== null ? Math.round(r.rating) : <span className="text-dim">–</span>}
                </td>
                <td className={cell}>{fmtAvg(r.average)}</td>
                <td className={`${cell} hidden md:table-cell`}>{fmtAvg(r.first9)}</td>
                <td className={`${cell} hidden md:table-cell`}>{r.checkoutPct !== null ? fmtPct(r.checkoutPct) : "–"}</td>
                <td className={`${cell} hidden lg:table-cell`}>{r.highestCheckout || "–"}</td>
                <td className={`${cell} hidden sm:table-cell`}>{r.n180}</td>
                <td className={`${cell} pr-5`}>{r.matches ? `${r.wins}/${r.matches}` : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-dim">
        Ratings use Glicko-2 and only move after ranked 501 matches. The other columns count every X01 match between people; games against bots
        count on your own profile but not here.
      </p>
    </main>
  );
}
