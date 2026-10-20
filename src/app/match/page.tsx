import { BackLink } from "@/components/ui";
import { getCurrentPlayer } from "@/lib/auth";
import { listPlayers } from "@/lib/queries";
import { MatchSetup } from "./match-setup";

export default async function MatchPage() {
  const me = await getCurrentPlayer();
  const all = await listPlayers();
  // You're the most likely player, so you come first.
  const players = [...all.filter((p) => p.id === me.id), ...all.filter((p) => p.id !== me.id)];

  return (
    <main className="safe-top safe-bottom mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 sm:px-8">
      <header className="flex flex-col gap-1 pt-2">
        <BackLink />
        <h1 className="font-display text-5xl font-extrabold tracking-tight">Match</h1>
      </header>
      <MatchSetup players={players} meId={me.id} />
    </main>
  );
}
