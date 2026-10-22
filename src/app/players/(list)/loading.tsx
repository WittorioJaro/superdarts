import { PageShell } from "@/components/page-shell";
import { Bone, TextBone } from "@/components/skeleton";
import { FOOTNOTE, LeaderboardTable } from "./leaderboard";

const right = "px-3 py-3";

export default function Loading() {
  return (
    <PageShell
      busy
      title="Players"
      aside={
        <div className="flex gap-2">
          <Bone className="h-11 w-[5.6rem]" />
          <Bone className="h-11 w-32" />
        </div>
      }
    >
      <LeaderboardTable>
        {Array.from({ length: 6 }, (_, i) => (
          <tr key={i} className="border-b border-wire/60 last:border-0">
            <td className="px-4 py-3 font-display text-xl text-dim">{i + 1}</td>
            <td className="px-3 py-3">
              <div className="flex items-center gap-3">
                <Bone className="h-10 w-10 shrink-0 rounded-full bg-felt" delay={i * 80} />
                <span className="flex min-w-0 flex-col">
                  <TextBone className="h-7 w-36 text-lg" width={`${60 + ((i * 23) % 40)}%`} delay={i * 80} />
                  <TextBone className="h-5 w-24 text-sm" width="80%" delay={i * 80} />
                </span>
              </div>
            </td>
            {["", "", "hidden md:table-cell", "hidden md:table-cell", "hidden lg:table-cell", "hidden sm:table-cell", "pr-5"].map((c, j) => (
              <td key={j} className={`${right} ${c}`}>
                <TextBone className="h-8 justify-end text-2xl" width="2.2rem" delay={i * 80} />
              </td>
            ))}
          </tr>
        ))}
      </LeaderboardTable>
      <p className="text-sm text-dim">{FOOTNOTE}</p>
    </PageShell>
  );
}
