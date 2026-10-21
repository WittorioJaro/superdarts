import { BackLink } from "@/components/ui";
import { getCurrentPlayer } from "@/lib/auth";
import { myRooms } from "@/lib/rooms";
import { OnlineHome } from "./online-home";

export default async function OnlinePage() {
  const me = await getCurrentPlayer();
  const rooms = await myRooms(me.id);

  return (
    <main className="safe-top safe-bottom mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 pb-10 sm:px-8">
      <header className="flex flex-col gap-1 pt-2">
        <BackLink />
        <h1 className="font-display text-5xl font-extrabold tracking-tight">Online</h1>
        <p className="text-lg text-dim">Play friends on their own boards. Each of you enters your own darts.</p>
      </header>
      <OnlineHome rooms={rooms} meId={me.id} />
    </main>
  );
}
