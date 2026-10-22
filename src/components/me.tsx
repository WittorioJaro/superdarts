"use client";

import Link from "next/link";
import { type ReactNode, createContext, useContext } from "react";
import { Avatar } from "@/components/ui";
import type { GamePlayer } from "@/lib/game-store";

const Me = createContext<GamePlayer | null>(null);

/** The signed-in player, loaded once by the root layout, so pages can draw it without waiting on the server. */
export function MeProvider({ me, children }: { me: GamePlayer; children: ReactNode }) {
  return <Me.Provider value={me}>{children}</Me.Provider>;
}

export function useMe() {
  return useContext(Me);
}

/** Avatar and first name, linking to your profile. */
export function MeChip() {
  const me = useMe();
  if (!me) return <span className="h-12 w-32 rounded-full bg-cabinet" />;
  return (
    <Link href={`/players/${me.id}`} className="flex items-center gap-3 rounded-full bg-cabinet py-1.5 pr-4 pl-1.5 transition hover:bg-felt">
      <Avatar name={me.name} color={me.color} url={me.avatarUrl} size={36} />
      <span className="font-medium">{me.name.split(" ")[0]}</span>
    </Link>
  );
}
