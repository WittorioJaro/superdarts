import { RINGS, SEGMENTS, labelPosition, wedgePath } from "@/lib/board-geometry";
import { doubleLabel } from "@/lib/darts/board";
import { fmtAvg } from "@/lib/darts/stats";

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** Three-dart average per game, oldest on the left. One series, so the title names it. */
export function AverageTrend({ points }: { points: { at: Date; average: number; kind: string }[] }) {
  if (points.length < 2) {
    return <p className="text-dim">Play a couple of scoring games to see your average over time.</p>;
  }
  const data = points.slice(-40);
  const max = Math.max(60, ...data.map((d) => d.average));
  const top = Math.ceil(max / 20) * 20;
  const W = 640;
  const H = 200;
  const gap = 2;
  const bw = (W - gap * (data.length - 1)) / data.length;
  const overall = data.reduce((n, d) => n + d.average, 0) / data.length;
  const gridlines = Array.from({ length: top / 20 + 1 }, (_, i) => i * 20);

  return (
    <figure>
      <svg viewBox={`-28 -8 ${W + 36} ${H + 30}`} className="h-auto w-full" role="img" aria-label={`Average per game, last ${data.length} games. Mean ${fmtAvg(overall)}.`}>
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
        <line x1={0} x2={W} y1={H - (overall / top) * H} y2={H - (overall / top) * H} stroke="var(--color-chalk)" strokeWidth={1.5} strokeDasharray="5 5" />
        <text x={W} y={H - (overall / top) * H - 6} textAnchor="end" className="fill-chalk text-[12px] font-semibold">
          mean {fmtAvg(overall)}
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
