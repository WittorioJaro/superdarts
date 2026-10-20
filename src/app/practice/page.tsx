import { BackLink } from "@/components/ui";
import { getCurrentPlayer } from "@/lib/auth";
import { todaysTraining, weaknessTargets } from "@/lib/queries";
import { PracticePicker } from "./practice-picker";

export default async function PracticePage() {
  const me = await getCurrentPlayer();
  const [weak, plan] = await Promise.all([weaknessTargets(me.id), todaysTraining(me.id)]);
  return (
    <main className="safe-top safe-bottom mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 sm:px-8">
      <header className="flex flex-col gap-1 pt-2">
        <BackLink />
        <h1 className="font-display text-5xl font-extrabold tracking-tight">Practice</h1>
      </header>
      <PracticePicker me={{ id: me.id, name: me.name, color: me.color, avatarUrl: me.avatarUrl }} weak={weak} plan={plan} />
    </main>
  );
}
