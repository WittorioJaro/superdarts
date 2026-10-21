"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { players } from "@/db/schema";
import { getCurrentPlayer } from "@/lib/auth";
import { pickColor } from "@/lib/colors";
import { type BotProfile, type BotModel, levelModel } from "@/lib/darts/bot";
import { ghostModel } from "@/lib/queries";
import type { SaveGameInput } from "@/lib/darts/schemas";
import { revalidateGameData } from "@/lib/revalidate-data";
import { persistGame, type SaveResult } from "@/lib/persist-game";

export type { SaveResult } from "@/lib/persist-game";

export async function saveGame(input: unknown): Promise<SaveResult> {
  const me = await getCurrentPlayer();

  const result = await persistGame(input as SaveGameInput, me.id);
  if (!result.ok) return result;

  revalidateGameData();
  return { ok: true };
}

const guestSchema = z.object({ name: z.string().trim().min(1).max(40) });

export async function addGuest(name: string) {
  await getCurrentPlayer();
  const parsed = guestSchema.safeParse({ name });
  if (!parsed.success) return { ok: false as const, error: "Give the player a name." };
  const count = await db.$count(players);
  const [player] = await db
    .insert(players)
    .values({ name: parsed.data.name, color: pickColor(count) })
    .returning({ id: players.id, name: players.name, color: players.color, avatarUrl: players.avatarUrl });
  revalidatePath("/match");
  revalidatePath("/players");
  return { ok: true as const, player };
}

const profileSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export async function updateProfile(input: { name: string; color: string }) {
  const me = await getCurrentPlayer();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Name can't be empty." };
  await db.update(players).set(parsed.data).where(eq(players.id, me.id));
  revalidatePath("/", "layout");
  return { ok: true as const };
}

const botProfileSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("level"), average: z.number().int().min(20).max(120) }),
  z.object({ kind: z.literal("ghost"), of: z.uuid(), from: z.iso.datetime(), to: z.iso.datetime() })
    .refine((p) => new Date(p.from) < new Date(p.to), "The ghost date range is empty"),
]);

export async function ensureBot(profile: BotProfile): Promise<{ id: string; name: string; color: string; avatarUrl: null; model: BotModel }> {
  await getCurrentPlayer();
  const p = botProfileSchema.parse(profile);
  const source = p.kind === "ghost" ? await db.query.players.findFirst({ where: eq(players.id, p.of) }) : null;
  if (p.kind === "ghost" && (!source || source.bot)) throw new Error("Ghosts require a real player");
  const model = p.kind === "level" ? levelModel(p.average) : await ghostModel(p.of, p.from, p.to);
  const name =
    p.kind === "level" ? `Bot ${p.average}` : `${source!.name.split(" ")[0]}, last ${Math.round((+new Date(p.to) - +new Date(p.from)) / 86400000) - 1} days`;
  const bot = await db.transaction(async (tx) => {
    const key = JSON.stringify(p);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 1))`);
    const [existing] = await tx.select().from(players).where(sql`${players.bot} = ${key}::jsonb`).limit(1);
    if (existing) return existing;
    const [created] = await tx.insert(players).values({ name, color: "#64748b", bot: p }).returning();
    return created;
  });
  return { id: bot.id, name: bot.name, color: bot.color, avatarUrl: null, model };
}
