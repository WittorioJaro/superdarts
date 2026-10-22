import type { CSSProperties } from "react";

/**
 * Placeholder blocks for loading states. Each skeleton is built from the same
 * layout as its page, so nothing jumps when the real content swaps in.
 */
export function Bone({ className = "", delay = 0, style }: { className?: string; delay?: number; style?: CSSProperties }) {
  // Defaults only apply when not overridden; two Tailwind utilities for the same property would race on stylesheet order.
  const defaults = `${/\brounded-/.test(className) ? "" : "rounded-xl"} ${/\bbg-/.test(className) ? "" : "bg-cabinet"}`;
  return <span aria-hidden className={`block animate-pulse ${defaults} ${className}`} style={{ animationDelay: `${delay}ms`, ...style }} />;
}

/**
 * One line of text at a given font size: the bar is as tall as the glyphs, inside a line box as tall as the real text.
 * Felt by default, since text mostly sits on cabinet-coloured cards.
 */
export function TextBone({ className = "", width, delay = 0, tone = "bg-felt" }: { className?: string; width: string; delay?: number; tone?: string }) {
  return (
    <span aria-hidden className={`flex items-center ${className}`}>
      <Bone className={`h-[0.7em] rounded-md ${tone}`} delay={delay} style={{ width }} />
    </span>
  );
}

/** Row placeholders inside the same card as RecentGames. */
export function RecentGamesSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul aria-hidden className="divide-y divide-wire overflow-hidden rounded-2xl bg-cabinet">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-4 px-5 py-3.5">
          <TextBone className="h-7 w-20 shrink-0 text-lg" width="70%" delay={i * 80} />
          <span className="min-w-0 flex-1">
            <TextBone className="h-6" width={`${55 + ((i * 17) % 30)}%`} delay={i * 80} />
            <TextBone className="h-5 text-sm" width={`${30 + ((i * 11) % 20)}%`} delay={i * 80} />
          </span>
          <TextBone className="h-7 w-12 text-xl" width="100%" delay={i * 80} />
          <TextBone className="h-5 w-14 shrink-0 justify-end text-sm" width="80%" delay={i * 80} />
        </li>
      ))}
    </ul>
  );
}
