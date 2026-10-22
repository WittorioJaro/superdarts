import { RecentGamesSkeleton } from "@/components/skeleton";
import { HomeView } from "./home-view";

export default function Loading() {
  return (
    <HomeView>
      <RecentGamesSkeleton />
    </HomeView>
  );
}
