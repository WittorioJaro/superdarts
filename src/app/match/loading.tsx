import { PageShell } from "@/components/page-shell";
import { MatchSetupSkeleton } from "./match-setup";

export default function Loading() {
  return (
    <PageShell busy title="Match">
      <MatchSetupSkeleton />
    </PageShell>
  );
}
