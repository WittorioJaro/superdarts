"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOut() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await createClient().auth.signOut();
        router.replace("/login");
        router.refresh();
      }}
      className="h-11 rounded-xl bg-cabinet px-4 font-medium text-dim hover:bg-felt hover:text-chalk"
    >
      Sign out
    </button>
  );
}
