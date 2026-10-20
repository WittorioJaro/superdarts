import Link from "next/link";
import { notFound } from "next/navigation";
import { AverageTrend, BoardHeatmap, DoublesTable, Sparkline } from "@/components/charts";
import { RecentGames } from "@/components/recent-games";
import { Avatar, BackLink } from "@/components/ui";
import { getCurrentPlayer } from "@/lib/auth";
import { gameDetail } from "@/lib/darts/labels";
import { MODES, type ModeId } from "@/lib/darts/modes";
import { fmtAvg, fmtPct } from "@/lib/darts/stats";
import { type StatsRange, type StatsScope, getPlayer, playerStats, practiceHistory, recentGames } from "@/lib/queries";
import { EditProfile } from "./edit-profile";
import { SignOut } from "./sign-out";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

export default async function PlayerPage({ params, searchParams }: PageProps<"/players/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const scope: StatsScope = sp.scope === "match" || sp.scope === "practice" ? sp.scope : "all";
  const range: StatsRange = sp.range === "30d" ? "30d" : "all";

  const [me, player] = await Promise.all([getCurrentPlayer(), getPlayer(id)]);
  if (!player) notFound();
  const isMe = me.id === player.id;

  const [stats, practice, recent] = await Promise.all([
    playerStats(player.id, scope, range),
    practiceHistory(player.id),
    recentGames(player.id, 10),
  ]);
  const s = stats.scoring;

  const link = (next: { scope?: StatsScope; range?: StatsRange }) => {
    const q = new URLSearchParams();
    const sc = next.scope ?? scope;
    const rg = next.range ?? range;
    if (sc !== "all") q.set("scope", sc);
    if (rg !== "all") q.set("range", rg);
    const qs = q.toString();
    return `/players/${player.id}${qs ? `?${qs}` : ""}`;
  };

  return (
    <main className="safe-top safe-bottom mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-5 pb-10 sm:px-8">
      <header className="flex flex-col gap-4 pt-2">
        <BackLink />
        <div className="flex flex-wrap items-center gap-5">
          <Avatar name={player.name} color={player.color} url={player.avatarUrl} size={76} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-5xl font-extrabold tracking-tight">{player.name}</h1>
            <p className="text-dim">
              {player.userId ? "Playing" : "Guest player"} since {monthFmt.format(player.createdAt)}
            </p>
          </div>
          {isMe && (
            <div className="flex gap-2">
              <EditProfile name={player.name} color={player.color} />
              <SignOut />
            </div>
          )}
        </div>
      </header>

      <nav aria-label="Filter stats" className="flex flex-wrap gap-2">
        {(
          [
            ["all", "All games"],
            ["match", "Matches"],
            ["practice", "Practice"],
          ] as const
        ).map(([v, label]) => (
          <FilterChip key={v} href={link({ scope: v })} active={scope === v}>
            {label}
          </FilterChip>
        ))}
        <span className="mx-1 w-px self-stretch bg-wire" />
        {(
          [
            ["all", "All time"],
            ["30d", "Last 30 days"],
          ] as const
        ).map(([v, label]) => (
          <FilterChip key={v} href={link({ range: v })} active={range === v}>
            {label}
          </FilterChip>
        ))}
      </nav>

      <section aria-label="Headline numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="3-dart average" value={fmtAvg(s.darts ? s.average : null)} hero />
        <Tile label="First 9 average" value={fmtAvg(s.darts ? s.first9 : null)} />
        <Tile
          label="Checkout rate"
          value={s.checkoutAttempts ? fmtPct(s.checkoutPct) : "–"}
          note={s.checkoutAttempts ? `${s.checkouts} of ${s.checkoutAttempts} darts at a double` : undefined}
        />
        <Tile
          label="Matches won"
          value={stats.matches.played ? `${stats.matches.won}/${stats.matches.played}` : "–"}
          note={stats.matches.legsPlayed ? `${stats.matches.legsWon} of ${stats.matches.legsPlayed} legs` : undefined}
        >
          {stats.matches.form.length > 0 && (
            <span className="mt-2 flex gap-1" aria-label="Last matches, oldest first">
              {stats.matches.form.map((w, i) => (
                <span key={i} className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${w ? "bg-treble text-ink" : "bg-double/70"}`}>
                  {w ? "W" : "L"}
                </span>
              ))}
            </span>
          )}
        </Tile>
      </section>

      <Section title="Average per game">
        <AverageTrend points={stats.averages.filter((a) => scope === "all" || a.kind === scope)} />
      </Section>

      <Section title="Scoring">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Num label="180s" value={s.n180} />
          <Num label="140+" value={s.n140} />
          <Num label="100+" value={s.n100} />
          <Num label="60+" value={s.n60} />
          <Num label="Highest visit" value={s.highest || "–"} />
          <Num label="Highest checkout" value={s.highestCheckout || "–"} />
          <Num label="Best 501 leg" value={s.bestLeg ? `${s.bestLeg} darts` : "–"} />
          <Num label="Darts thrown" value={s.darts.toLocaleString("en-GB")} />
        </dl>
      </Section>

      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <Section title="Doubles">
          <DoublesTable doubles={stats.doubles} />
        </Section>
        <Section title="Where the darts land">
          <BoardHeatmap heat={stats.heat} />
        </Section>
      </div>

      <Section title="Practice">
        <PracticeCards sessions={practice} />
      </Section>

      <Section title="Recent games">
        <RecentGames games={recent} me={player.id} />
      </Section>
    </main>
  );
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`flex h-11 items-center rounded-xl px-4 font-medium transition ${active ? "bg-chalk text-ink" : "bg-cabinet text-chalk hover:bg-felt"}`}
    >
      {children}
    </Link>
  );
}

function Tile({ label, value, note, hero, children }: { label: string; value: string; note?: string; hero?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`flex flex-col rounded-3xl p-5 ${hero ? "bg-brass text-ink" : "bg-cabinet"}`}>
      <span className={hero ? "font-medium text-ink/70" : "text-dim"}>{label}</span>
      <span className="font-display text-6xl leading-none font-extrabold tracking-tight">{value}</span>
      {note && <span className={`mt-2 text-sm ${hero ? "text-ink/70" : "text-dim"}`}>{note}</span>}
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-3xl font-bold">{title}</h2>
      <div className="rounded-3xl bg-cabinet p-5 sm:p-6">{children}</div>
    </section>
  );
}

function Num({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-dim">{label}</dt>
      <dd className="font-display text-4xl font-bold">{value}</dd>
    </div>
  );
}

type Session = Awaited<ReturnType<typeof practiceHistory>>[number];

function PracticeCards({ sessions }: { sessions: Session[] }) {
  if (sessions.length === 0) return <p className="text-dim">No practice sessions yet.</p>;

  // Group by drill and by the settings that change what a score means.
  const groups = new Map<string, Session[]>();
  for (const s of sessions) {
    const key = `${s.mode}|${gameDetail(s.mode, s.config)}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[...groups.entries()].map(([key, list]) => {
        const mode = list[0].mode as ModeId;
        const metric = practiceMetric(mode);
        // Unfinished runs don't count when fewer is better.
        const ranked = metric.better === "lower" ? list.filter((l) => l.status === "finished") : list;
        const values = ranked.map(metric.value);
        const best = values.length ? (metric.better === "higher" ? Math.max(...values) : Math.min(...values)) : null;
        const last = list[list.length - 1];
        return (
          <li key={key} className="flex flex-col gap-3 rounded-2xl bg-felt p-5">
            <div>
              <h3 className="font-display text-2xl font-bold">{mode === "x01" ? `Solo ${last.config.startScore}` : MODES[mode].name}</h3>
              <p className="text-sm text-dim">
                {gameDetail(mode, last.config)}, {list.length} {list.length === 1 ? "session" : "sessions"}
              </p>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-sm text-dim">{metric.label}</div>
                <div className="font-display text-4xl font-extrabold text-brass">{best === null ? "–" : metric.format(best)}</div>
                <div className="text-sm text-dim">Last: {metric.format(metric.value(last))}</div>
              </div>
              <Sparkline values={values} better={metric.better} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function practiceMetric(mode: ModeId) {
  const info = MODES[mode];
  if (mode === "x01") {
    return { label: "Fewest darts", better: "lower" as const, value: (l: Session) => l.darts, format: String };
  }
  if (mode === "scoring") {
    return { label: "Best average", better: "higher" as const, value: (l: Session) => l.average ?? 0, format: (n: number) => fmtAvg(n) };
  }
  const labels: Partial<Record<ModeId, string>> = {
    around: "Fewest darts",
    bobs27: "Best score",
    doubles: "Most hits",
    checkout: "Most finishes",
    shanghai: "Best score",
  };
  return {
    label: labels[mode] ?? "Best",
    better: info.better,
    value: (l: Session) => l.score,
    format: (n: number) => String(n),
  };
}
