import { PageShell } from "@/components/page-shell";
import { MatchSetupSkeleton } from "./match-setup";
import { PubTableLink } from "./pub-link";

export default function Loading() {
  return (
    <PageShell busy title="Match" aside={<PubTableLink />}>
      <MatchSetupSkeleton />
    </PageShell>
  );
}
