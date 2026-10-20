import { gameDetail, gameTitle } from "@/lib/darts/labels";
import { fmtAvg } from "@/lib/darts/stats";
import type { GameRow } from "@/lib/queries";

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

export function RecentGames({ games, me }: { games: GameRow[]; me: string }) {
  if (games.length === 0) {
    return (
      <p className="rounded-2xl bg-cabinet px-5 py-6 text-dim">
        Nothing here yet. Finished games and practice sessions show up here.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-wire overflow-hidden rounded-2xl bg-cabinet">
      {games.map((g) => {
        const mine = g.players.find((p) => p.id === me);
        const others = g.players.filter((p) => p.id !== me);
        const won = !!mine?.winner;
        return (
          <li key={g.id} className="flex items-center gap-4 px-5 py-3.5">
            <span
              className={`w-20 shrink-0 font-display text-lg font-bold ${
                g.kind === "match" ? (won ? "text-treble" : "text-double") : "text-dim"
              }`}
            >
              {g.kind === "match" ? (won ? "Won" : "Lost") : "Practice"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {g.kind === "match"
                  ? `${gameTitle(g.mode, g.config)} against ${others.map((o) => o.name.split(" ")[0]).join(", ") || "nobody"}`
                  : `${gameTitle(g.mode, g.config)}: ${practiceOutcome(g, mine?.score ?? 0)}`}
              </span>
              <span className="block truncate text-sm text-dim">
                {g.kind === "match"
                  ? g.players.map((p) => `${p.name.split(" ")[0]} ${Number(g.config.sets) > 1 ? p.setsWon : p.legsWon}`).join(" – ")
                  : gameDetail(g.mode, g.config)}
                {g.status === "stopped" && ", ended early"}
              </span>
            </span>
            {mine?.average !== null && mine?.average !== undefined && (
              <span className="text-right">
                <span className="block font-display text-xl font-semibold">{fmtAvg(mine.average)}</span>
                <span className="block text-xs text-dim">avg</span>
              </span>
            )}
            <span className="w-14 shrink-0 text-right text-sm text-dim">{dateFmt.format(g.finishedAt)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function practiceOutcome(g: GameRow, score: number): string {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  switch (g.mode) {
    case "x01":
      return g.status === "finished" ? "checked out" : "not finished";
    case "scoring":
      return n(score, "point", "points");
    case "around":
      return g.status === "finished" ? n(score, "dart", "darts") : "not finished";
    case "bobs27":
    case "shanghai":
      return n(score, "point", "points");
    case "doubles":
      return n(score, "double hit", "doubles hit");
    case "checkout":
      return `${score} of ${(g.config.targets as unknown[]).length} out`;
  }
}
