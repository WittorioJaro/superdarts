"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { usePendingSaves } from "@/lib/game-store";
import { syncPending } from "@/lib/sync";

/** Sends games that finished while offline. Renders only while something is waiting or failed. */
export function SyncPending() {
  const pending = usePendingSaves();
  const router = useRouter();
  const [failed, setFailed] = useState<string | null>(null);

  const flush = useCallback(async () => {
    const res = await syncPending();
    if (res.errors.length) setFailed(res.errors[0]);
    if (res.saved) router.refresh();
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [flush]);

  if (failed) {
    return (
      <p role="alert" className="rounded-2xl border border-double/40 bg-double/10 px-5 py-3">
        A game couldn&apos;t be saved: {failed}
      </p>
    );
  }
  if (pending.length === 0) return null;
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-cabinet px-5 py-3">
      <span>
        {pending.length === 1 ? "1 game is" : `${pending.length} games are`} waiting to be saved. They&apos;ll go up when
        you&apos;re back online.
      </span>
      <button type="button" onClick={flush} className="shrink-0 rounded-xl bg-felt px-4 py-2 font-semibold hover:bg-wire">
        Save now
      </button>
    </div>
  );
}
