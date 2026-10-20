import { notFound } from "next/navigation";
import { BackLink } from "@/components/ui";
import { getCurrentPlayer } from "@/lib/auth";
import { gameDetail, gameTitle } from "@/lib/darts/labels";
import { getGame } from "@/lib/queries";
import { Replay } from "./replay";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dateFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export default async function GamePage({ params }: PageProps<"/games/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [, game] = await Promise.all([getCurrentPlayer(), getGame(id)]);
  if (!game) notFound();
  const config = game.config as unknown as Record<string, unknown>;

  return (
    <main className="safe-top safe-bottom mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 pb-10 sm:px-8">
      <header className="flex flex-col gap-1 pt-2">
        <BackLink />
        <h1 className="font-display text-5xl font-extrabold tracking-tight">
          {gameTitle(game.mode, config)}
          {game.kind === "match" && game.ranked && <span className="ml-3 align-middle text-lg font-semibold text-brass">Ranked</span>}
        </h1>
        <p className="text-dim">
          {gameDetail(game.mode, config)}. {dateFmt.format(game.finishedAt)}
          {game.status === "stopped" && ". Ended early"}
        </p>
      </header>
      <Replay game={{ ...game, players: game.players.map((p) => ({ ...p })) }} />
    </main>
  );
}
