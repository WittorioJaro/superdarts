import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, cache } from "react";
import { AverageTrend, BoardHeatmap, DoublesTable, MissBreakdown, PracticeVsMatch, RatingChart, SessionFade, Sparkline } from "@/components/charts";
import { CallerButton } from "@/components/caller-settings";
import { RecentGames } from "@/components/recent-games";
import { Avatar, BackLink } from "@/components/ui";
import { getCurrentAdmin, getCurrentPlayer } from "@/lib/auth";
import { dartLabel } from "@/lib/darts/board";
import { gameDetail, gameTitle } from "@/lib/darts/labels";
import { MODES, type ModeId } from "@/lib/darts/modes";
import { fmtAvg, fmtPct } from "@/lib/darts/stats";
import {
  type StatsRange,
  type StatsScope,
  achievements,
  fatigue,
  getPlayer,
  playerStats,
  practiceHistory,
  practiceTargets,
  practiceVsMatch,
  ratingHistory,
  recentGames,
  targetSpread,
} from "@/lib/queries";
import { EditProfile } from "./edit-profile";
import { ProfileStatsSkeleton, Section } from "./profile-skeleton";
import { Invites } from "./invites";
import { ManagePlayers } from "./manage-players";
import { SignOut } from "./sign-out";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** `?target=20:3` picks the target-practice target to break down; T20 by default. */
function parseTarget(v: string | string[] | undefined): { s: number; m: 1 | 2 | 3 } {
  const [s, m] = String(v ?? "20:3").split(":").map(Number);
  const ok = ((s >= 1 && s <= 20) || s === 25) && (m === 1 || m === 2 || m === 3) && !(s === 25 && m === 3);
  return ok ? { s, m: m as 1 | 2 | 3 } : { s: 20, m: 3 };
}

export default async function PlayerPage({ params, searchParams }: PageProps<"/players/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID.test(id)) notFound();
  const scope: StatsScope = sp.scope === "match" || sp.scope === "practice" ? sp.scope : "all";
  const range: StatsRange = sp.range === "30d" ? "30d" : "all";
  const target = parseTarget(sp.target);

  const [me, player] = await Promise.all([getCurrentPlayer(), getPlayer(id)]);
  if (!player) notFound();
  const isMe = me.id === player.id;
  const admin = isMe ? await getCurrentAdmin() : null;

  const link = (next: { scope?: StatsScope; range?: StatsRange; target?: string }) => {
    const q = new URLSearchParams();
    const sc = next.scope ?? scope;
    const rg = next.range ?? range;
    const tg = next.target ?? `${target.s}:${target.m}`;
    if (sc !== "all") q.set("scope", sc);
    if (rg !== "all") q.set("range", rg);
    if (tg !== "20:3") q.set("target", tg);
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
              <Suspense>
                <CurrentRating playerId={player.id} />
              </Suspense>
            </p>
          </div>
          {!isMe && (
            <Link href={`/players/${me.id}/vs/${player.id}`} className="flex h-11 items-center rounded-xl bg-cabinet px-4 font-medium hover:bg-felt">
              Head to head
            </Link>
          )}
          {isMe && (
            <div className="flex flex-wrap gap-2">
              {admin && <ManagePlayers />}
              {admin && <Invites />}
              <EditProfile name={player.name} color={player.color} />
              <CallerButton label="Sound" className="flex h-11 items-center gap-2 rounded-xl bg-cabinet px-4 font-medium text-dim hover:bg-felt hover:text-chalk" />
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

      <Suspense fallback={<ProfileStatsSkeleton />}>
        <ProfileStats playerId={player.id} scope={scope} range={range} target={target} link={link} />
      </Suspense>
    </main>
  );
}

/** Called by the header and the rating chart in the same request; this runs the query once. */
const ratings = cache(ratingHistory);

async function CurrentRating({ playerId }: { playerId: string }) {
  const rating = (await ratings(playerId)).at(-1)?.rating;
  if (rating === undefined) return null;
  return (
    <>
      {" · "}
      <span className="font-semibold text-brass">Rating {Math.round(rating)}</span>
    </>
  );
}

/** Everything below the filters. Streams in after the header, which only needs the player. */
async function ProfileStats({
  playerId,
  scope,
  range,
  target,
  link,
}: {
  playerId: string;
  scope: StatsScope;
  range: StatsRange;
  target: { s: number; m: 1 | 2 | 3 };
  link: (next: { scope?: StatsScope; range?: StatsRange; target?: string }) => string;
}) {
  const [stats, practice, recent, rating, awards, targets, spread, weeks, fade] = await Promise.all([
    playerStats(playerId, scope, range),
    practiceHistory(playerId),
    recentGames(playerId, 10),
    ratings(playerId),
    achievements(playerId),
    practiceTargets(playerId),
    targetSpread(playerId, target, range),
    practiceVsMatch(playerId),
    fatigue(playerId),
  ]);
  const s = stats.scoring;

  return (
    <>
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
          <Num label="Darts in X01 and free throw" value={s.darts.toLocaleString("en-GB")} />
          <Num label="Darts per leg won" value={s.dartsPerLeg ? s.dartsPerLeg.toFixed(1) : "–"} />
          <Num label="Cricket marks per round" value={stats.cricket.mpr !== null ? stats.cricket.mpr.toFixed(2) : "–"} />
        </dl>
      </Section>

      {rating.length > 0 && (
        <Section title="Rating">
          <RatingChart points={rating} />
        </Section>
      )}

      <Section title="Achievements">
        <Achievements items={awards} />
      </Section>

      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <Section title="Doubles">
          <DoublesTable doubles={stats.doubles} />
        </Section>
        <Section title="Where the darts land">
          <BoardHeatmap heat={stats.heat} />
        </Section>
      </div>

      <Section title="Where the misses go">
        {targets.length === 0 ? (
          <p className="text-dim">Throw a round of target practice and this shows which way your misses drift.</p>
        ) : (
          <div className="flex flex-col gap-5">
            <nav aria-label="Target" className="flex flex-wrap gap-2">
              {targets.map((t) => {
                const key = `${t.s}:${t.m}`;
                return (
                  <FilterChip key={key} href={link({ target: key })} active={t.s === target.s && t.m === target.m}>
                    {dartLabel({ s: t.s, m: t.m as 1 | 2 | 3 })} <span className="ml-1.5 text-sm opacity-70">{t.total}</span>
                  </FilterChip>
                );
              })}
            </nav>
            {spread.total === 0 ? (
              <p className="text-dim">No target practice at {dartLabel(target)} in this range.</p>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                <BoardHeatmap heat={spread.landings} />
                <div className="flex flex-col gap-3">
                  <p className="text-lg">
                    {spread.total} darts at <span className="font-display text-2xl font-bold text-brass">{dartLabel(target)}</span>
                    {spread.left !== spread.right && spread.left + spread.right > 0 && (
                      <span className="text-dim">. Misses lean {spread.left > spread.right ? "left" : "right"}.</span>
                    )}
                  </p>
                  <MissBreakdown spread={spread} />
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <Section title="Practice and matches">
          <PracticeVsMatch weeks={weeks} />
        </Section>
        <Section title="Over a session">
          <SessionFade buckets={fade} />
        </Section>
      </div>

      <Section title="Practice">
        <PracticeCards sessions={practice} />
      </Section>

      <Section title="Recent games">
        <RecentGames games={recent} me={playerId} />
      </Section>
    </>
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

function Num({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-dim">{label}</dt>
      <dd className="font-display text-4xl font-bold">{value}</dd>
    </div>
  );
}

function Achievements({ items }: { items: Awaited<ReturnType<typeof achievements>> }) {
  const done = items.filter((a) => a.achievedAt);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-dim">
        {done.length} of {items.length} unlocked
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((a) => (
          <li key={a.id} className={`flex flex-col gap-1 rounded-2xl p-4 ${a.achievedAt ? "bg-felt" : "border-2 border-dashed border-wire text-dim"}`}>
            <span className="flex items-baseline justify-between gap-3">
              <span className={`font-display text-2xl font-bold ${a.achievedAt ? "text-chalk" : ""}`}>{a.title}</span>
              {a.value && <span className="font-display text-2xl font-bold text-brass">{a.value}</span>}
            </span>
            <span className="text-sm">{a.description}</span>
            {a.achievedAt && <span className="text-sm text-dim">{dayFmt.format(a.achievedAt)}</span>}
          </li>
        ))}
      </ul>
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
              <h3 className="font-display text-2xl font-bold">{mode === "x01" ? `Solo ${last.config.startScore}` : gameTitle(mode, last.config)}</h3>
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
    cricket: "Fewest darts",
    onetwentyone: "Highest finish",
    target: "Most hits",
    around: "Fewest darts",
    bobs27: "Best score",
    doubles: "Most hits",
    checkout: "Most finishes",
    shanghai: "Best score",
  };
  return {
    label: labels[mode] ?? "Best",
    // Cricket on your own is about closing out in the fewest darts.
    better: mode === "cricket" ? ("lower" as const) : info.better,
    value: (l: Session) => l.score,
    format: (n: number) => String(n),
  };
}
