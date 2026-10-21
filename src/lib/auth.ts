import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { type Player, players } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { pickColor } from "@/lib/colors";

/** Optional comma-separated list of emails allowed in. Empty means anyone with a Google account. */
export function isEmailAllowed(email: string | undefined) {
  const list = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.length === 0 || (!!email && list.includes(email.toLowerCase()));
}

/** The signed-in user's player profile, created on first sign-in. Redirects to login when signed out. */
export const getCurrentPlayer = cache(async (): Promise<Player> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  if (!isEmailAllowed(claims.email)) redirect("/login?error=not_invited");

  const existing = await db.query.players.findFirst({ where: eq(players.userId, claims.sub) });
  if (existing) return existing;

  const meta = (claims.user_metadata ?? {}) as Record<string, string | undefined>;
  const name = meta.full_name ?? meta.name ?? claims.email?.split("@")[0] ?? "Player";
  const count = await db.$count(players);
  const [created] = await db
    .insert(players)
    .values({ userId: claims.sub, name, avatarUrl: meta.avatar_url ?? meta.picture ?? null, color: pickColor(count) })
    .onConflictDoUpdate({ target: players.userId, set: { userId: claims.sub } })
    .returning();
  return created;
});

/** Like getCurrentPlayer, but null instead of redirecting. For the root layout, which also renders the login page. */
export const getSignedInPlayer = cache(async (): Promise<Player | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub || !isEmailAllowed(data.claims.email)) return null;
  return getCurrentPlayer();
});
