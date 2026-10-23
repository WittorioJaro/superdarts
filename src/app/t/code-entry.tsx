"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import { redeemTableCode } from "@/app/table-actions";
import { tableStore } from "@/lib/game-store";
import { TABLE_CODE_LENGTH, normalizeTableCode } from "@/lib/pub-table-types";

const ALLOWED = /[^A-HJKMNP-Z2-9]/g;

export function CodeEntry({ logo }: { logo: ReactNode }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Whatever an earlier table left on this device goes, so the next group starts clean.
  useEffect(() => {
    tableStore.clear();
  }, []);

  function submit(value: string) {
    if (value.length !== TABLE_CODE_LENGTH || pending) return;
    startTransition(async () => {
      try {
        const res = await redeemTableCode(value);
        if (res.ok) return router.refresh();
        setError(res.error);
        setCode("");
      } catch {
        setError("Couldn't reach Superdarts. Check the connection and try again.");
      }
    });
  }

  return (
    <main className="safe-top safe-bottom flex flex-1 flex-col items-center justify-center gap-10 px-6 text-center">
      <div className="flex flex-col items-center gap-5">
        {logo}
        <div>
          <h1 className="font-display text-6xl font-extrabold tracking-tight">Superdarts</h1>
          <p className="mt-2 text-lg text-dim">Type the table code from your phone to start scoring.</p>
        </div>
      </div>
      <form
        className="flex w-full max-w-md flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit(code);
        }}
      >
        <label className="flex flex-col gap-2">
          <span className="sr-only">Table code</span>
          <input
            value={code.length > 3 ? `${code.slice(0, 3)} ${code.slice(3)}` : code}
            onChange={(e) => {
              const next = normalizeTableCode(e.target.value).replace(ALLOWED, "").slice(0, TABLE_CODE_LENGTH);
              setCode(next);
              setError(null);
              if (next.length === TABLE_CODE_LENGTH) submit(next);
            }}
            disabled={pending}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            placeholder="ABC 123"
            aria-invalid={!!error}
            className="h-24 rounded-2xl border-2 border-wire bg-ink px-4 text-center font-display text-6xl font-bold tracking-[0.2em] uppercase outline-none placeholder:text-wire focus:border-chalk disabled:opacity-60"
          />
        </label>
        <button
          type="submit"
          disabled={pending || code.length !== TABLE_CODE_LENGTH}
          className="h-16 rounded-2xl bg-double font-display text-2xl font-bold transition active:scale-[0.98] disabled:opacity-40"
        >
          {pending ? "Opening the table…" : "Open table"}
        </button>
        {error && (
          <p role="alert" className="rounded-xl border border-double/40 bg-double/10 px-4 py-3 text-sm">
            {error}
          </p>
        )}
      </form>
      <p className="max-w-md text-sm text-dim">
        No code? On your phone, open Superdarts and go to Match, then Pub table. Nobody signs in on this computer, and
        closing the table locks it again.
      </p>
    </main>
  );
}
