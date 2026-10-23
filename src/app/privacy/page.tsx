import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = { title: "Privacy policy · superdarts" };

export default function PrivacyPage() {
  return (
    <PageShell title="Privacy policy" subtitle={<p className="text-dim">superdarts · A private hobby darts app</p>}>
      <article className="flex max-w-2xl flex-col gap-6 rounded-2xl border border-wire bg-cabinet p-6 text-base leading-relaxed sm:p-8">
        <section>
          <h2 className="font-display text-2xl font-bold">What we keep and why</h2>
          <p className="mt-2 text-dim">superdarts is invite-only. We use Google sign-in through Supabase to identify players. We store your Google account ID, name, email address and avatar URL, along with invitation details, player profiles, games, scores, practice results, statistics and online room activity needed to run the app. We only request basic Google identity information, not access to your Gmail, Drive or other Google content.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl font-bold">Who can see it</h2>
          <p className="mt-2 text-dim">Other players can see your player name, avatar, game history, scores, statistics and online presence. We do not sell your data or share it for advertising. Data is processed by the services that operate the app: Google for sign-in, Supabase for authentication, database and realtime features, Vercel for hosting, and LiveKit for live room media.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl font-bold">Cameras and your device</h2>
          <p className="mt-2 text-dim">Optional camera and microphone streams are sent through LiveKit to participants in your online room. The app does not record or store these streams. Anyone with a camera link can use it while it is valid, so keep it private. Sign-in uses session cookies; games in progress and practice plans can also be saved in your browser. Service providers may process technical connection information to operate their services.</p>
        </section>
        <section>
          <h2 className="font-display text-2xl font-bold">Keeping and deleting data</h2>
          <p className="mt-2 text-dim">We keep account and game data to maintain player history until it is no longer needed or you request deletion. To request access, correction or deletion of your account and associated data, or ask a privacy question, email <a className="text-chalk underline underline-offset-4" href="mailto:wiktor.jaro@gmail.com">wiktor.jaro@gmail.com</a> from your sign-in email. We may need to confirm your identity. You can clear locally saved data in your browser settings.</p>
        </section>
        <Link href="/terms" className="text-dim underline underline-offset-4 hover:text-chalk">Terms of service</Link>
      </article>
    </PageShell>
  );
}
