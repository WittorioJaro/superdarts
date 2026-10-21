import { PageShell } from "@/components/page-shell";
import { getCurrentPlayer } from "@/lib/auth";
import { myRooms } from "@/lib/rooms";
import { OnlineHome } from "./online-home";

const SUBTITLE = "Play friends on their own boards. Each of you enters your own darts.";

export default function OnlinePage() {
  return (
    <PageShell title="Online" subtitle={<p className="text-lg text-dim">{SUBTITLE}</p>}>
      <OnlineHome rooms={getCurrentPlayer().then((me) => myRooms(me.id))} />
    </PageShell>
  );
}
