import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { type Player, invites, players } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { pickColor } from "@/lib/colors";

function emailList(value: string | undefined) {
  return (value ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
}

export function isAdminEmail(email: string | undefined) {
  return !!email && emailList(process.env.ADMIN_EMAILS).includes(email.trim().toLowerCase());
}

/** Empty ALLOWED_EMAILS keeps sign-in open to anyone with a Google account. */
export const isEmailAllowed = cache(async (email: string | undefined): Promise<boolean> => {
  const list = emailList(process.env.ALLOWED_EMAILS);
  if (list.length === 0) return true;
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (list.includes(normalized) || isAdminEmail(normalized)) return true;
  return !!await db.query.invites.findFirst({ columns: { email: true }, where: eq(invites.email, normalized) });
});

const getClaims = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims;
});

/** The signed-in user's player profile, created on first sign-in. Redirects to login when signed out. */
export const getCurrentPlayer = cache(async (): Promise<Player> => {
  const claims = await getClaims();
  if (!claims?.sub) redirect("/login");
  if (!await isEmailAllowed(claims.email)) redirect("/login?error=not_invited");

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
  const claims = await getClaims();
  if (!claims?.sub || !await isEmailAllowed(claims.email)) return null;
  return getCurrentPlayer();
});

export const getCurrentAdmin = cache(async (): Promise<Player | null> => {
  const claims = await getClaims();
  if (!claims?.sub || !isAdminEmail(claims.email)) return null;
  return getCurrentPlayer();
});
