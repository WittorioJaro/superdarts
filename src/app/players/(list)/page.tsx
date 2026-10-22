import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { Avatar } from "@/components/ui";
import { getCurrentPlayer } from "@/lib/auth";
import { fmtAvg, fmtPct } from "@/lib/darts/stats";
import { type StatsRange, leaderboard } from "@/lib/queries";
import { FOOTNOTE, LeaderboardTable, RangeNav, cell } from "./leaderboard";

export default async function PlayersPage({ searchParams }: PageProps<"/players">) {
  const sp = await searchParams;
  const range: StatsRange = sp.range === "30d" ? "30d" : "all";
  const [me, rows] = await Promise.all([getCurrentPlayer(), leaderboard(range)]);

  return (
    <PageShell title="Players" aside={<RangeNav range={range} />}>
      <LeaderboardTable>
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
      </LeaderboardTable>
      <p className="text-sm text-dim">{FOOTNOTE}</p>
    </PageShell>
  );
}
