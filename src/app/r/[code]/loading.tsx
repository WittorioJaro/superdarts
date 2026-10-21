import { Bone, TextBone } from "@/components/skeleton";
import { BackLink } from "@/components/ui";

/** The lobby's frame: code card and players on the left, camera and game on the right. */
export default function Loading() {
  return (
    <main aria-busy className="safe-top safe-bottom mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 pb-10 sm:px-8">
      <header className="flex flex-col gap-1 pt-2">
        <BackLink href="/online" label="Online" />
        <Bone className="h-12 w-60" />
      </header>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col gap-6">
          <section className="flex flex-col gap-4 rounded-3xl bg-cabinet p-6">
            <span className="text-sm font-medium text-dim">Room code</span>
            <TextBone className="h-[4.5rem] font-display text-7xl" width="15rem" />
            <div className="flex gap-2">
              <Bone className="h-14 flex-1 rounded-2xl bg-felt" />
              <Bone className="h-14 w-32 rounded-2xl bg-felt" />
            </div>
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-2xl font-bold">Players</h2>
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl bg-cabinet p-3">
                <Bone className="h-11 w-11 rounded-full bg-felt" delay={i * 100} />
                <TextBone className="h-7 flex-1 text-lg" width="40%" delay={i * 100} />
              </div>
            ))}
          </section>
        </div>
        <section className="flex flex-col gap-5">
          <Bone className="aspect-video w-full rounded-2xl" />
          <div className="flex flex-col gap-1 rounded-2xl bg-cabinet p-4">
            <span className="text-sm font-medium text-dim">Game</span>
            <TextBone className="h-8 text-2xl" width="40%" />
          </div>
          <Bone className="h-20 rounded-2xl bg-double" />
        </section>
      </div>
    </main>
  );
}
