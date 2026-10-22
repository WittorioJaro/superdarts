import { Bone, TextBone } from "@/components/skeleton";
import { BackLink } from "@/components/ui";

/** Two sides with avatars and win counts, then the side-by-side numbers. */
export default function Loading() {
  return (
    <main aria-busy className="safe-top safe-bottom mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-5 pb-10 sm:px-8">
      <header className="flex flex-col gap-4 pt-2">
        <BackLink href="/players" label="Players" />
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          {[false, true].map((right) => (
            <div key={String(right)} className={`flex items-center gap-4 ${right ? "flex-row-reverse" : ""}`}>
              <Bone className="h-16 w-16 shrink-0 rounded-full" />
              <div className={`flex min-w-0 flex-col ${right ? "items-end" : ""}`}>
                <TextBone className="h-7 w-28 text-xl" width="100%" tone="bg-cabinet" />
                <TextBone className="h-[4.5rem] w-12 font-display text-7xl" width="100%" tone="bg-cabinet" />
              </div>
            </div>
          ))}
          <span className="col-start-2 row-start-1 font-display text-3xl font-bold text-dim">vs</span>
        </div>
        <TextBone className="h-7 justify-center text-lg" width="14rem" tone="bg-cabinet" />
      </header>
      <section className="rounded-3xl bg-cabinet p-5 sm:p-6">
        <div className="flex flex-col divide-y divide-wire">
          {["Average", "Checkout rate", "Highest checkout", "180s"].map((label, i) => (
            <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 py-3">
              <TextBone className="h-10 font-display text-4xl" width="4rem" delay={i * 80} />
              <span className="text-center text-dim">{label}</span>
              <TextBone className="h-10 justify-end font-display text-4xl" width="4rem" delay={i * 80} />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
