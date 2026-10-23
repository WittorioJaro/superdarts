import { asc } from "drizzle-orm";
import { db } from "@/db";
import { invites } from "@/db/schema";
import { getCurrentAdmin } from "@/lib/auth";
import { InviteForm } from "./invite-form";

export async function Invites() {
  if (!await getCurrentAdmin()) return null;
  const rows = await db.select({ email: invites.email }).from(invites).orderBy(asc(invites.email));
  return <InviteForm emails={rows.map((row) => row.email)} />;
}
