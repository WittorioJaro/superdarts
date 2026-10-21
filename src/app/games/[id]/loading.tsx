import { PageShell } from "@/components/page-shell";
import { Bone, TextBone } from "@/components/skeleton";

/** Title, scoreline, then the board and the visits table side by side, as in Replay. */
export default function Loading() {
  return (
    <PageShell busy title={<Bone className="h-12 w-64" />} subtitle={<TextBone className="h-6" width="18rem" tone="bg-cabinet" />}>
      <div className="flex flex-col gap-6">
        <ul className="grid grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <li key={i} className="flex items-center gap-3 rounded-2xl bg-cabinet p-4">
              <Bone className="h-10 w-10 rounded-full bg-felt" delay={i * 100} />
              <span className="min-w-0 flex-1">
                <TextBone className="h-7 text-lg" width="50%" delay={i * 100} />
                <TextBone className="h-5 text-sm" width="35%" delay={i * 100} />
              </span>
              <TextBone className="h-10 w-8 font-display text-4xl" width="100%" delay={i * 100} />
            </li>
          ))}
        </ul>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <section className="flex flex-col gap-4 rounded-3xl bg-cabinet p-5">
            <Bone className="mx-auto aspect-square w-full max-w-md rounded-full bg-felt" />
            <Bone className="h-12 bg-felt" />
          </section>
          <section className="flex flex-col divide-y divide-wire rounded-3xl bg-cabinet">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3">
                <TextBone className="h-7 w-8" width="100%" delay={i * 60} />
                <TextBone className="h-7 flex-1" width={`${40 + ((i * 17) % 35)}%`} delay={i * 60} />
                <TextBone className="h-7 w-12" width="100%" delay={i * 60} />
              </div>
            ))}
          </section>
        </div>
      </div>
    </PageShell>
  );
}
