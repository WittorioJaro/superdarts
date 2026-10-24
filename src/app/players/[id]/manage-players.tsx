import { getCurrentAdmin } from "@/lib/auth";
import { listAllPlayers } from "@/lib/queries";
import { PlayerList } from "./player-list";

export async function ManagePlayers() {
  const admin = await getCurrentAdmin();
  if (!admin) return null;
  const rows = await listAllPlayers();
  return <PlayerList players={rows} meId={admin.id} />;
}
