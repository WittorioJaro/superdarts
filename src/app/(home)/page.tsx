import { Suspense } from "react";
import { RecentGames } from "@/components/recent-games";
import { RecentGamesSkeleton } from "@/components/skeleton";
import { getCurrentPlayer } from "@/lib/auth";
import { recentGames } from "@/lib/queries";
import { HomeView } from "./home-view";

/** Everything but your recent games is known up front, so the page draws at once and only that list streams in. */
export default function Home() {
  return (
    <HomeView>
      <Suspense fallback={<RecentGamesSkeleton />}>
        <Recent />
      </Suspense>
    </HomeView>
  );
}

async function Recent() {
  const me = await getCurrentPlayer();
  return <RecentGames games={await recentGames(me.id, 6)} me={me.id} />;
}
