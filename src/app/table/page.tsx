import { PageShell } from "@/components/page-shell";
import { getCurrentPlayer } from "@/lib/auth";
import { listPlayers } from "@/lib/queries";
import { listHostTables } from "@/app/table-actions";
import { HostTable } from "./host-table";

export default async function HostTablePage() {
  const [me, all, open] = await Promise.all([getCurrentPlayer(), listPlayers(), listHostTables()]);
  const players = [...all.filter((p) => p.id === me.id), ...all.filter((p) => p.id !== me.id)];
  return (
    <PageShell
      title="Pub table"
      subtitle={<p className="text-lg text-dim">Score on the pub&apos;s computer without signing in there. Games count for the players you pick.</p>}
    >
      <HostTable players={players} meId={me.id} open={open} />
    </PageShell>
  );
}
