import { RINGS, SEGMENTS, labelPosition, wedgePath } from "@/lib/board-geometry";

/** A plain board in the app's colours. Children are drawn on top in the same 0–320 coordinate space. */
export function Dartboard({ children, label, className }: { children?: React.ReactNode; label: string; className?: string }) {
  const C = 160;
  const R = 130;
  return (
    <svg viewBox="0 0 320 320" className={className ?? "h-auto w-full"} role="img" aria-label={label}>
      <circle cx={C} cy={C} r={R + 4} fill="var(--color-ink)" />
      {SEGMENTS.map((s) => {
        const ring = s.even ? "var(--color-double)" : "var(--color-treble)";
        const field = s.even ? "#1b1b1b" : "#d9d2bd";
        return (
          <g key={s.n} opacity={0.55}>
            <path d={wedgePath(C, C, R * RINGS.outerBull, R * RINGS.trebleIn, s.a0, s.a1)} fill={field} />
            <path d={wedgePath(C, C, R * RINGS.trebleIn, R * RINGS.trebleOut, s.a0, s.a1)} fill={ring} />
            <path d={wedgePath(C, C, R * RINGS.trebleOut, R * RINGS.doubleIn, s.a0, s.a1)} fill={field} />
            <path d={wedgePath(C, C, R * RINGS.doubleIn, R, s.a0, s.a1)} fill={ring} />
          </g>
        );
      })}
      <circle cx={C} cy={C} r={R * RINGS.outerBull} fill="var(--color-treble)" opacity={0.55} />
      <circle cx={C} cy={C} r={R * RINGS.bull} fill="var(--color-double)" opacity={0.7} />
      {SEGMENTS.map((s) => {
        const [x, y] = labelPosition(C, C, R + 15, s.n);
        return (
          <text key={s.n} x={x} y={y + 5} textAnchor="middle" className="fill-dim font-display text-[15px] font-semibold">
            {s.n}
          </text>
        );
      })}
      {children}
    </svg>
  );
}

export const BOARD = { C: 160, R: 130 };
