import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { client?: postgres.Sql };

// Supabase's transaction pooler doesn't support prepared statements.
const client =
  globalForDb.client ?? postgres(process.env.DATABASE_URL!, { prepare: false, max: 5, idle_timeout: 20 });
if (process.env.NODE_ENV !== "production") globalForDb.client = client;

export const db = drizzle(client, { schema });
