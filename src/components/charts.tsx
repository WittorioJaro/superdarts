import { RINGS, SEGMENTS, labelPosition, wedgePath } from "@/lib/board-geometry";
import { doubleLabel } from "@/lib/darts/board";
import { fmtAvg } from "@/lib/darts/stats";

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

const ROLLING = 20;

/** Three-dart average per game as bars, oldest on the left, with the rolling average of the last 20 games as a line. */
export function AverageTrend({ points }: { points: { at: Date; average: number; kind: string }[] }) {
  if (points.length < 2) {
    return <p className="text-dim">Play a couple of scoring games to see your average over time.</p>;
  }
  // The rolling line uses games before the visible window too, so its left end isn't skewed.
  const rolling = points.map((_, i) => {
    const win = points.slice(Math.max(0, i - ROLLING + 1), i + 1);
    return win.reduce((n, p) => n + p.average, 0) / win.length;
  });
  const data = points.slice(-40);
  const roll = rolling.slice(-40);
  const max = Math.max(60, ...data.map((d) => d.average));
  const top = Math.ceil(max / 20) * 20;
  const W = 640;
  const H = 200;
  const gap = 2;
  const bw = (W - gap * (data.length - 1)) / data.length;
  const gridlines = Array.from({ length: top / 20 + 1 }, (_, i) => i * 20);

  return (
    <figure>
      <svg
        viewBox={`-28 -8 ${W + 36} ${H + 30}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Average per game, last ${data.length} games. Rolling average over the last ${ROLLING}: ${fmtAvg(roll[roll.length - 1])}.`}
      >
        {gridlines.map((g) => {
          const y = H - (g / top) * H;
          return (
            <g key={g}>
              <line x1={0} x2={W} y1={y} y2={y} stroke="var(--color-wire)" strokeWidth={g === 0 ? 1.5 : 0.75} />
              <text x={-8} y={y + 4} textAnchor="end" className="fill-dim text-[11px]">
                {g}
              </text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = Math.max(2, (d.average / top) * H);
          const x = i * (bw + gap);
          return (
            <g key={i}>
              <title>{`${dateFmt.format(d.at)}, ${d.kind}: ${fmtAvg(d.average)}`}</title>
              {/* Taller invisible hit area, so a tap anywhere in the column shows the value. */}
              <rect x={x} y={0} width={bw} height={H} fill="transparent" />
              <path
                d={`M${x} ${H}V${H - h + Math.min(4, bw / 2)}q0 -${Math.min(4, bw / 2)} ${Math.min(4, bw / 2)} -${Math.min(4, bw / 2)}H${x + bw - Math.min(4, bw / 2)}q${Math.min(4, bw / 2)} 0 ${Math.min(4, bw / 2)} ${Math.min(4, bw / 2)}V${H}Z`}
                fill="var(--color-brass)"
              />
            </g>
          );
        })}
        <polyline
          points={roll.map((v, i) => `${i * (bw + gap) + bw / 2},${H - (v / top) * H}`).join(" ")}
          fill="none"
          stroke="var(--color-chalk)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <text x={W} y={H - (roll[roll.length - 1] / top) * H - 8} textAnchor="end" className="fill-chalk text-[12px] font-semibold">
          last {ROLLING}: {fmtAvg(roll[roll.length - 1])}
        </text>
        <text x={0} y={H + 20} className="fill-dim text-[11px]">
          {dateFmt.format(data[0].at)}
        </text>
        <text x={W} y={H + 20} textAnchor="end" className="fill-dim text-[11px]">
          {dateFmt.format(data[data.length - 1].at)}
        </text>
      </svg>
    </figure>
  );
}

/** Hit rate on every double, from checkout attempts and doubles drills. */
export function DoublesTable({ doubles }: { doubles: Map<number, { attempts: number; hits: number }> }) {
  const order = [...Array.from({ length: 20 }, (_, i) => i + 1), 25];
  if (doubles.size === 0) {
    return <p className="text-dim">Checkout attempts and doubles practice fill this in.</p>;
  }
  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
      {order.map((n) => {
        const d = doubles.get(n);
        const pct = d && d.attempts ? (d.hits / d.attempts) * 100 : null;
        return (
          <li key={n} className="grid grid-cols-[3rem_1fr_6.5rem] items-center gap-3" title={d ? `${d.hits} of ${d.attempts}` : "No darts yet"}>
            <span className="font-display text-xl font-bold">{doubleLabel(n)}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-ink">
              {pct !== null && <span className="block h-full rounded-full bg-brass" style={{ width: `${Math.max(pct, 2)}%` }} />}
            </span>
            <span className="text-right text-sm text-dim">
              {d ? (
                <>
                  <span className="font-display text-lg font-semibold text-chalk">{Math.round(pct!)}%</span> {d.hits}/{d.attempts}
                </>
              ) : (
                "–"
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Where scoring darts land, shaded by share of all darts. Singles fill both single beds. */
export function BoardHeatmap({ heat }: { heat: { s: number; m: number; n: number }[] }) {
  const total = heat.reduce((n, h) => n + h.n, 0);
  if (total === 0) return <p className="text-dim">Your scoring darts show up here once you&apos;ve played.</p>;
  const count = (s: number, m: number) => heat.find((h) => h.s === s && h.m === m)?.n ?? 0;
  // Singles cover far more area, so shade each ring against its own busiest bed.
  const maxSingle = Math.max(1, ...heat.filter((h) => h.m === 1 && h.s !== 25).map((h) => h.n));
  const maxRing = Math.max(1, ...heat.filter((h) => h.m > 1 || h.s === 25).map((h) => h.n));
  const misses = count(0, 0);
  const C = 160;
  const R = 130;
  const shade = (n: number, max: number) => (n === 0 ? 0 : 0.12 + 0.88 * (n / max));

  const region = (key: string, d: string, n: number, max: number, label: string) => (
    <path key={key} d={d} fill="var(--color-brass)" fillOpacity={shade(n, max)} stroke="var(--color-cabinet)" strokeWidth={1}>
      <title>{`${label}: ${n} ${n === 1 ? "dart" : "darts"} (${((n / total) * 100).toFixed(1)}%)`}</title>
    </path>
  );

  return (
    <figure className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 320 320" className="h-auto w-full max-w-md" role="img" aria-label={`Where your ${total} scoring darts landed`}>
        <circle cx={C} cy={C} r={R} fill="var(--color-ink)" />
        {SEGMENTS.map((s) => [
          region(`${s.n}-si`, wedgePath(C, C, R * RINGS.outerBull, R * RINGS.trebleIn, s.a0, s.a1), count(s.n, 1), maxSingle, String(s.n)),
          region(`${s.n}-t`, wedgePath(C, C, R * RINGS.trebleIn, R * RINGS.trebleOut, s.a0, s.a1), count(s.n, 3), maxRing, `T${s.n}`),
          region(`${s.n}-so`, wedgePath(C, C, R * RINGS.trebleOut, R * RINGS.doubleIn, s.a0, s.a1), count(s.n, 1), maxSingle, String(s.n)),
          region(`${s.n}-d`, wedgePath(C, C, R * RINGS.doubleIn, R, s.a0, s.a1), count(s.n, 2), maxRing, `D${s.n}`),
        ])}
        <circle cx={C} cy={C} r={R * RINGS.outerBull} fill="var(--color-ink)" />
        <circle cx={C} cy={C} r={R * RINGS.outerBull} fill="var(--color-brass)" fillOpacity={shade(count(25, 1), maxRing)} stroke="var(--color-cabinet)">
          <title>{`25: ${count(25, 1)} darts`}</title>
        </circle>
        <circle cx={C} cy={C} r={R * RINGS.bull} fill="var(--color-ink)" />
        <circle cx={C} cy={C} r={R * RINGS.bull} fill="var(--color-brass)" fillOpacity={shade(count(25, 2), maxRing)} stroke="var(--color-cabinet)">
          <title>{`Bull: ${count(25, 2)} darts`}</title>
        </circle>
        <circle cx={C} cy={C} r={R} fill="none" stroke="var(--color-wire)" strokeWidth={1.5} />
        {SEGMENTS.map((s) => {
          const [x, y] = labelPosition(C, C, R + 15, s.n);
          return (
            <text key={s.n} x={x} y={y + 5} textAnchor="middle" className="fill-dim font-display text-[15px] font-semibold">
              {s.n}
            </text>
          );
        })}
      </svg>
      <figcaption className="text-center text-sm text-dim">
        {total} scoring darts. Darker brass is where more land. {misses > 0 && `${misses} missed the board.`}
      </figcaption>
    </figure>
  );
}

/** Tiny trend for a drill's session scores. */
export function Sparkline({ values, better }: { values: number[]; better: "higher" | "lower" }) {
  if (values.length < 2) return null;
  const W = 120;
  const H = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 3 - ((v - min) / span) * (H - 6)]);
  const best = better === "higher" ? max : min;
  const bi = values.lastIndexOf(best);
  return (
    <svg viewBox={`-4 -4 ${W + 8} ${H + 8}`} width={W} height={H} aria-hidden>
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--color-dim)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[bi][0]} cy={pts[bi][1]} r={4} fill="var(--color-brass)" stroke="var(--color-felt)" strokeWidth={2} />
    </svg>
  );
}

/** Rating after each ranked match, as a line. */
export function RatingChart({ points }: { points: { at: Date; rating: number }[] }) {
  if (points.length < 2) return <p className="text-dim">Play a couple of ranked 501 matches to see your rating move.</p>;
  const W = 640;
  const H = 160;
  const lo = Math.floor((Math.min(...points.map((p) => p.rating)) - 20) / 50) * 50;
  const hi = Math.ceil((Math.max(...points.map((p) => p.rating)) + 20) / 50) * 50;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (r: number) => H - ((r - lo) / (hi - lo)) * H;
  const grid = Array.from({ length: (hi - lo) / 50 + 1 }, (_, i) => lo + i * 50);
  const last = points[points.length - 1];
  return (
    <svg viewBox={`-40 -10 ${W + 50} ${H + 34}`} className="h-auto w-full" role="img" aria-label={`Rating over ${points.length} ranked matches, now ${Math.round(last.rating)}.`}>
      {grid.map((g) => (
        <g key={g}>
          <line x1={0} x2={W} y1={y(g)} y2={y(g)} stroke="var(--color-wire)" strokeWidth={0.75} />
          <text x={-8} y={y(g) + 4} textAnchor="end" className="fill-dim text-[11px]">
            {g}
          </text>
        </g>
      ))}
      <polyline points={points.map((p, i) => `${x(i)},${y(p.rating)}`).join(" ")} fill="none" stroke="var(--color-brass)" strokeWidth={2.5} strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.rating)} r={8} fill="transparent">
          <title>{`${dateFmt.format(p.at)}: ${Math.round(p.rating)}`}</title>
        </circle>
      ))}
      <circle cx={x(points.length - 1)} cy={y(last.rating)} r={5} fill="var(--color-brass)" stroke="var(--color-cabinet)" strokeWidth={2} />
      <text x={0} y={H + 22} className="fill-dim text-[11px]">
        {dateFmt.format(points[0].at)}
      </text>
      <text x={W} y={H + 22} textAnchor="end" className="fill-dim text-[11px]">
        {dateFmt.format(last.at)}
      </text>
    </svg>
  );
}

/**
 * Practice volume and match average per week, as two small charts on the same weeks,
 * so you can see whether busy practice weeks come before better match weeks.
 */
export function PracticeVsMatch({ weeks }: { weeks: { week: Date; practiceDarts: number; matchAverage: number | null }[] }) {
  if (!weeks.some((w) => w.practiceDarts > 0) || !weeks.some((w) => w.matchAverage !== null)) {
    return <p className="text-dim">Once you have a few weeks with both practice and matches, this shows whether one follows the other.</p>;
  }
  const W = 640;
  const H1 = 90;
  const H2 = 110;
  const n = weeks.length;
  const bw = W / n - 3;
  const maxDarts = Math.max(...weeks.map((w) => w.practiceDarts));
  const avgs = weeks.flatMap((w) => (w.matchAverage === null ? [] : [w.matchAverage]));
  const lo = Math.floor(Math.min(...avgs) / 10) * 10 - 10;
  const hi = Math.ceil(Math.max(...avgs) / 10) * 10 + 10;
  const cx = (i: number) => i * (W / n) + bw / 2;
  const y2 = (v: number) => H1 + 30 + H2 - ((v - lo) / (hi - lo)) * H2;
  const line = weeks.map((w, i) => (w.matchAverage === null ? null : `${cx(i)},${y2(w.matchAverage)}`)).filter(Boolean);
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`-34 -18 ${W + 40} ${H1 + H2 + 60}`} className="h-auto w-full" role="img" aria-label="Practice darts per week above, match average per week below">
        <text x={0} y={-6} className="fill-dim text-[12px] font-semibold">
          Practice darts per week
        </text>
        {weeks.map((w, i) => {
          const h = (w.practiceDarts / maxDarts) * H1;
          return (
            <rect key={i} x={i * (W / n)} y={H1 - h} width={bw} height={Math.max(h, w.practiceDarts ? 2 : 0)} rx={2} fill="var(--color-treble)">
              <title>{`Week of ${dateFmt.format(w.week)}: ${w.practiceDarts} practice darts`}</title>
            </rect>
          );
        })}
        <line x1={0} x2={W} y1={H1} y2={H1} stroke="var(--color-wire)" />
        <text x={0} y={H1 + 22} className="fill-dim text-[12px] font-semibold">
          Match average
        </text>
        {[lo, (lo + hi) / 2, hi].map((g) => (
          <g key={g}>
            <line x1={0} x2={W} y1={y2(g)} y2={y2(g)} stroke="var(--color-wire)" strokeWidth={0.75} />
            <text x={-6} y={y2(g) + 4} textAnchor="end" className="fill-dim text-[11px]">
              {Math.round(g)}
            </text>
          </g>
        ))}
        {line.length > 1 && <polyline points={line.join(" ")} fill="none" stroke="var(--color-brass)" strokeWidth={2} strokeLinejoin="round" />}
        {weeks.map((w, i) =>
          w.matchAverage === null ? null : (
            <circle key={i} cx={cx(i)} cy={y2(w.matchAverage)} r={4} fill="var(--color-brass)" stroke="var(--color-cabinet)" strokeWidth={1.5}>
              <title>{`Week of ${dateFmt.format(w.week)}: ${fmtAvg(w.matchAverage)} match average`}</title>
            </circle>
          ),
        )}
        <text x={0} y={H1 + H2 + 52} className="fill-dim text-[11px]">
          {dateFmt.format(weeks[0].week)}
        </text>
        <text x={W} y={H1 + H2 + 52} textAnchor="end" className="fill-dim text-[11px]">
          {dateFmt.format(weeks[n - 1].week)}
        </text>
      </svg>
    </figure>
  );
}

/** Average by how far into a session the darts were thrown. Bars, because the buckets are separate ranges. */
export function SessionFade({ buckets }: { buckets: { fromMinute: number; toMinute: number; average: number; darts: number }[] }) {
  if (buckets.length < 2) return <p className="text-dim">This fills in as you play longer sessions. It uses the time each dart was thrown.</p>;
  const max = Math.max(...buckets.map((b) => b.average));
  const best = buckets.reduce((a, b) => (b.average > a.average ? b : a));
  return (
    <ul className="flex flex-col gap-2">
      {buckets.map((b) => (
        <li key={b.fromMinute} className="grid grid-cols-[6.5rem_1fr_4rem] items-center gap-3" title={`${b.darts} darts`}>
          <span className="text-dim">{b.toMinute < 1000 ? `${b.fromMinute}–${b.toMinute} min` : `${b.fromMinute}+ min`}</span>
          <span className="h-3 overflow-hidden rounded-full bg-ink">
            <span className={`block h-full rounded-full ${b === best ? "bg-brass" : "bg-dim/60"}`} style={{ width: `${(b.average / max) * 100}%` }} />
          </span>
          <span className="text-right font-display text-xl font-semibold">{fmtAvg(b.average)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Where darts aimed at one target ended up: on it, either side, the wrong ring, or elsewhere. */
export function MissBreakdown({ spread }: { spread: { total: number; hits: number; left: number; right: number; ring: number; other: number } }) {
  const parts = [
    { label: "On target", n: spread.hits, tone: "bg-treble" },
    { label: "Left", n: spread.left, tone: "bg-brass" },
    { label: "Right", n: spread.right, tone: "bg-brass" },
    { label: "Right number, wrong ring", n: spread.ring, tone: "bg-dim" },
    { label: "Somewhere else", n: spread.other, tone: "bg-double/70" },
  ];
  return (
    <ul className="flex flex-col gap-2">
      {parts.map((p) => (
        <li key={p.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
          <span className="text-dim">{p.label}</span>
          <span className="font-display text-xl font-semibold">
            {spread.total ? Math.round((p.n / spread.total) * 100) : 0}% <span className="text-sm font-normal text-dim">{p.n}</span>
          </span>
          <span className="col-span-2 h-2.5 overflow-hidden rounded-full bg-ink">
            <span className={`block h-full rounded-full ${p.tone}`} style={{ width: `${spread.total ? (p.n / spread.total) * 100 : 0}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
