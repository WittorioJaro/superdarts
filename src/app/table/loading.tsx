import { PageShell } from "@/components/page-shell";
import { Bone } from "@/components/skeleton";

export default function Loading() {
  return (
    <PageShell busy title="Pub table" subtitle={<p className="text-lg text-dim">Score on the pub&apos;s computer without signing in there. Games count for the players you pick.</p>}>
      <div aria-hidden className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center gap-3 rounded-2xl bg-cabinet p-3">
              <Bone className="h-11 w-11 rounded-full bg-felt" delay={i * 100} />
              <Bone className="h-4 w-28 rounded-md bg-felt" delay={i * 100} />
            </li>
          ))}
        </ul>
        <Bone className="h-48 rounded-3xl" />
      </div>
    </PageShell>
  );
}
