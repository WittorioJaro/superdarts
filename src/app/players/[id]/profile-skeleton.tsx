import type { ReactNode } from "react";
import { Bone, TextBone } from "@/components/skeleton";
import { BackLink } from "@/components/ui";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-3xl font-bold">{title}</h2>
      <div className="rounded-3xl bg-cabinet p-5 sm:p-6">{children}</div>
    </section>
  );
}

/** Same tiles and section frames as ProfileStats; only the numbers and charts are placeholders. */
export function ProfileStatsSkeleton() {
  return (
    <>
      <section aria-hidden className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {["3-dart average", "First 9 average", "Checkout rate", "Matches won"].map((label, i) => (
          <div key={label} className={`flex flex-col rounded-3xl p-5 ${i === 0 ? "bg-brass text-ink" : "bg-cabinet"}`}>
            <span className={i === 0 ? "font-medium text-ink/70" : "text-dim"}>{label}</span>
            <TextBone className="h-[3.75rem] font-display text-6xl" width="60%" tone={i === 0 ? "bg-ink/15" : "bg-felt"} delay={i * 100} />
          </div>
        ))}
      </section>
      <Section title="Average per game">
        <Bone className="aspect-[676/238] w-full bg-felt" />
      </Section>
      <Section title="Scoring">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i}>
              <TextBone className="h-6" width={`${40 + ((i * 13) % 30)}%`} delay={i * 50} />
              <TextBone className="h-10 font-display text-4xl" width="2.5rem" delay={i * 50} />
            </div>
          ))}
        </dl>
      </Section>
      <Section title="Achievements">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Bone key={i} className="h-28 rounded-2xl bg-felt" delay={i * 100} />
          ))}
        </div>
      </Section>
    </>
  );
}

/** Header placeholders matching the profile's avatar, name and filter chips. */
export function ProfileSkeleton() {
  return (
    <main aria-busy className="safe-top safe-bottom mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-5 pb-10 sm:px-8">
      <header className="flex flex-col gap-4 pt-2">
        <BackLink />
        <div className="flex flex-wrap items-center gap-5">
          <Bone className="h-[76px] w-[76px] rounded-full" />
          <div className="min-w-0 flex-1">
            <TextBone className="h-12 font-display text-5xl" width="16rem" tone="bg-cabinet" />
            <TextBone className="h-6" width="12rem" tone="bg-cabinet" />
          </div>
        </div>
      </header>
      <div className="flex flex-wrap gap-2">
        {[104, 100, 96].map((w, i) => (
          <Bone key={i} className="h-11" style={{ width: w }} />
        ))}
        <span className="mx-1 w-px self-stretch bg-wire" />
        {[90, 128].map((w, i) => (
          <Bone key={i} className="h-11" style={{ width: w }} />
        ))}
      </div>
      <ProfileStatsSkeleton />
    </main>
  );
}
