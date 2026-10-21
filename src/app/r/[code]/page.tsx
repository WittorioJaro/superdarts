import Link from "next/link";
import { getCurrentPlayer } from "@/lib/auth";
import { getRoomByCode } from "@/lib/rooms";
import { Room } from "./room";

export default async function RoomPage({ params }: PageProps<"/r/[code]">) {
  const { code } = await params;
  const [me, found] = await Promise.all([getCurrentPlayer(), getRoomByCode(code)]);

  if (!found) {
    return (
      <main className="safe-top safe-bottom mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-6 text-center">
        <h1 className="font-display text-5xl font-extrabold">No room called {code.toUpperCase()}</h1>
        <p className="text-lg text-dim">Check the code, or ask your friend to send the link again.</p>
        <Link href="/online" className="mx-auto rounded-2xl bg-chalk px-8 py-4 font-display text-2xl font-bold text-ink">
          Go to Online
        </Link>
      </main>
    );
  }

  return <Room key={found.snapshot.id} initial={found.snapshot} me={{ id: me.id, name: me.name, color: me.color, avatarUrl: me.avatarUrl }} />;
}
