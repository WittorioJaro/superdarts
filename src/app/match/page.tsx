import { PageShell } from "@/components/page-shell";
import { getCurrentPlayer } from "@/lib/auth";
import { listPlayers } from "@/lib/queries";
import { MatchSetup } from "./match-setup";
import { PubTableLink } from "./pub-link";

export default async function MatchPage() {
  const [me, all] = await Promise.all([getCurrentPlayer(), listPlayers()]);
  // You're the most likely player, so you come first.
  const players = [...all.filter((p) => p.id === me.id), ...all.filter((p) => p.id !== me.id)];

  return (
    <PageShell title="Match" aside={<PubTableLink />}>
      <MatchSetup players={players} meId={me.id} />
    </PageShell>
  );
}
