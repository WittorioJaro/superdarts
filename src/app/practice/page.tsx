import { PageShell } from "@/components/page-shell";
import { getCurrentPlayer } from "@/lib/auth";
import { todaysTraining, weaknessTargets } from "@/lib/queries";
import { PracticePicker } from "./practice-picker";

export default function PracticePage() {
  // Not awaited: the drills show at once and only the parts built from your stats wait for it.
  const stats = getCurrentPlayer().then(async (me) => {
    const [weak, plan] = await Promise.all([weaknessTargets(me.id), todaysTraining(me.id)]);
    return { weak, plan };
  });
  return (
    <PageShell title="Practice">
      <PracticePicker stats={stats} />
    </PageShell>
  );
}
