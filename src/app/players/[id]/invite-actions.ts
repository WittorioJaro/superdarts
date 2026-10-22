"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { invites } from "@/db/schema";
import { getCurrentAdmin } from "@/lib/auth";

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export async function inviteEmail(input: unknown) {
  const admin = await getCurrentAdmin();
  if (!admin) return { ok: false as const, error: "Only admins can manage invites." };
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Enter a valid Google email address." };
  await db.insert(invites).values({ email: parsed.data, invitedBy: admin.id }).onConflictDoNothing();
  revalidatePath(`/players/${admin.id}`);
  return { ok: true as const };
}

export async function revokeInvite(input: unknown) {
  const admin = await getCurrentAdmin();
  if (!admin) return { ok: false as const, error: "Only admins can manage invites." };
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Enter a valid email address." };
  await db.delete(invites).where(eq(invites.email, parsed.data));
  revalidatePath(`/players/${admin.id}`);
  return { ok: true as const };
}
