import Link from "next/link";
import { BoardMark } from "@/components/board-mark";
import { GoogleButton } from "./google-button";

const ERRORS: Record<string, string> = {
  not_invited: "That Google account isn't on the player list. Ask whoever runs Superdarts to add your email.",
  sign_in_failed: "Google sign-in didn't complete. Try again.",
  missing_code: "Google sign-in didn't complete. Try again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;

  return (
    <main className="safe-top safe-bottom flex flex-1 flex-col items-center justify-center gap-10 px-6">
      <div className="flex flex-col items-center gap-6 text-center">
        <BoardMark size={132} />
        <div>
          <h1 className="font-display text-6xl font-extrabold tracking-tight">Superdarts</h1>
          <p className="mt-2 text-lg text-dim">Scores, practice and stats for our darts nights.</p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-dim">
            Keep score for friendly darts matches, plan practice sessions, follow your progress and play together in online rooms with optional live board cameras.
          </p>
        </div>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-4">
        <GoogleButton />
        {message && (
          <p role="alert" className="rounded-xl border border-double/40 bg-double/10 px-4 py-3 text-center text-sm">
            {message}
          </p>
        )}
        <Link href="/t" className="text-center text-dim underline-offset-4 hover:text-chalk hover:underline">
          Got a table code? Score without signing in
        </Link>
      </div>
      <footer className="text-center text-sm text-dim">
        <p>Invite-only darts with friends.</p>
        <nav aria-label="Legal" className="mt-2 flex justify-center gap-5">
          <Link href="/privacy" className="underline underline-offset-4 transition hover:text-chalk">Privacy policy</Link>
          <Link href="/terms" className="underline underline-offset-4 transition hover:text-chalk">Terms of service</Link>
        </nav>
      </footer>
    </main>
  );
}
