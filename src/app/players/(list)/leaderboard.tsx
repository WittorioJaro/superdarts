import Link from "next/link";
import type { ReactNode } from "react";
import type { StatsRange } from "@/lib/queries";

export const head = "px-3 py-3 text-right text-sm font-medium text-dim";
export const cell = "px-3 py-3 text-right font-display text-2xl font-semibold";

export function RangeNav({ range }: { range: StatsRange }) {
  return (
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
  );
}

/** The leaderboard card and its column headings; rows come from the page or the skeleton. */
export function LeaderboardTable({ children }: { children: ReactNode }) {
  return (
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
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const FOOTNOTE =
  "Ratings use Glicko-2 and only move after ranked 501 matches. The other columns count every X01 match between people; games against bots count on your own profile but not here.";
