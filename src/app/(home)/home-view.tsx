import Link from "next/link";
import type { ReactNode } from "react";
import { BoardMark } from "@/components/board-mark";
import { OnlineFriends } from "@/components/friends";
import { MeChip } from "@/components/me";
import { ResumeBanner } from "@/components/resume-banner";
import { SyncPending } from "@/components/sync-pending";

/** Shared with loading.tsx, which passes the skeleton instead of the list. */
export function HomeView({ children }: { children: ReactNode }) {
  return (
    <main className="safe-top safe-bottom mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-5 sm:px-8">
      <header className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <BoardMark size={36} />
          <span className="font-display text-2xl font-bold tracking-tight">Superdarts</span>
        </div>
        <MeChip />
      </header>

      <OnlineFriends />
      <SyncPending />
      <ResumeBanner />

      {/* A set height rather than flex-1: filling the leftover space made the cards resize, and their text move, as the list below loaded. */}
      <nav aria-label="Play" className="grid shrink-0 gap-4 md:h-[clamp(24rem,56svh,38rem)] md:grid-cols-[1.25fr_1fr] md:grid-rows-2">
        <Link
          href="/practice"
          className="group relative flex min-h-56 flex-col justify-end overflow-hidden rounded-[2rem] bg-treble p-7 text-ink transition active:scale-[0.99] md:row-span-2"
        >
          <Rings className="absolute -top-24 -right-24 h-[26rem] w-[26rem] text-ink/15 transition-transform duration-700 group-hover:rotate-12" />
          <span className="relative font-display text-7xl leading-none font-extrabold tracking-tight sm:text-8xl">Practice</span>
          <span className="relative mt-3 max-w-sm text-lg font-medium text-ink/75">
            Free throw, doubles, checkouts, Bob&apos;s 27 and more. Pick a drill and start throwing.
          </span>
        </Link>

        <Link
          href="/match"
          className="group relative flex min-h-44 flex-col justify-end overflow-hidden rounded-[2rem] bg-double p-7 transition active:scale-[0.99]"
        >
          <span className="font-display text-6xl leading-none font-extrabold tracking-tight">Match</span>
          <span className="mt-2 text-lg font-medium text-chalk/80">Pick who&apos;s playing. Every dart counts on their profile.</span>
        </Link>

        <Link
          href="/online"
          className="group relative flex min-h-44 flex-col justify-end overflow-hidden rounded-[2rem] bg-felt p-7 ring-2 ring-wire transition active:scale-[0.99]"
        >
          <span className="font-display text-6xl leading-none font-extrabold tracking-tight">Online</span>
          <span className="mt-2 text-lg font-medium text-dim">Private rooms with an invite link. Live scores, camera and voice.</span>
        </Link>
      </nav>

      <section aria-labelledby="recent" className="pb-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="recent" className="font-display text-2xl font-bold">
            Your recent games
          </h2>
          <Link href="/players" className="text-dim hover:text-chalk">
            All players
          </Link>
        </div>
        {children}
      </section>
    </main>
  );
}

function Rings({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 200 200" className={className} fill="none" stroke="currentColor">
      <circle cx="100" cy="100" r="96" strokeWidth="8" />
      <circle cx="100" cy="100" r="62" strokeWidth="8" />
      <circle cx="100" cy="100" r="22" strokeWidth="8" />
      <circle cx="100" cy="100" r="7" fill="currentColor" stroke="none" />
    </svg>
  );
}
