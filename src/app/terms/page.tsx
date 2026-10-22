import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = { title: "Terms of service · superdarts" };

export default function TermsPage() {
  return (
    <PageShell title="Terms of service" subtitle={<p className="text-dim">superdarts · A private hobby darts app</p>}>
      <article className="flex max-w-2xl flex-col gap-6 rounded-2xl border border-wire bg-cabinet p-6 text-base leading-relaxed sm:p-8">
        <section>
          <h2 className="font-display text-2xl font-bold">Playing with friends</h2>
          <p className="mt-2 text-dim">superdarts is a free, invite-only hobby app for darts scoring, practice and friendly games. Use your own Google account and only use the app if you have been invited. Access may be withdrawn if the app is misused.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl font-bold">Be considerate</h2>
          <p className="mt-2 text-dim">Enter scores honestly, respect other players and do not try to access accounts or rooms without permission. Keep room and camera links private. Only share camera or microphone streams with the permission of anyone who may be seen or heard. Do not record or redistribute other players&apos; streams without their permission.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl font-bold">A hobby service</h2>
          <p className="mt-2 text-dim">The app is provided as available, without a promise of uninterrupted access or perfectly accurate scores and statistics. Features may change, and the service may stop. Keep your own copy of any results that matter to you. Nothing here limits rights that applicable law gives you.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl font-bold">Privacy and contact</h2>
          <p className="mt-2 text-dim">Read the <Link href="/privacy" className="text-chalk underline underline-offset-4">privacy policy</Link> for how your information is used. For questions, problems or an account deletion request, email <a href="mailto:wiktor.jaro@gmail.com" className="text-chalk underline underline-offset-4">wiktor.jaro@gmail.com</a>.</p>
        </section>
      </article>
    </PageShell>
  );
}
