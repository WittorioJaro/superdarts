"use client";

import Link from "next/link";
import { gameTitle } from "@/lib/darts/labels";
import { useActiveGame } from "@/lib/game-store";

export function ResumeBanner() {
  const game = useActiveGame();
  if (!game) return null;
  const names = game.players.map((p) => p.name.split(" ")[0]).join(" v ");
  return (
    <Link
      href="/play"
      className="flex items-center justify-between gap-4 rounded-2xl border-2 border-brass bg-brass/10 px-5 py-4 transition active:scale-[0.99]"
    >
      <span>
        <span className="block font-display text-2xl font-bold">
          Carry on with {gameTitle(game.mode, game.config as unknown as Record<string, unknown>)}
        </span>
        <span className="block text-dim">
          {game.kind === "match" ? names : "Practice"}, {game.darts.length} darts thrown
        </span>
      </span>
      <span className="rounded-xl bg-brass px-5 py-3 font-display text-xl font-bold text-ink">Resume</span>
    </Link>
  );
}
