import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

// Vercel freezes the function between requests, and a connection left idle across a freeze can come back
// as a dead socket that swallows queries without ever erroring. attachDatabasePool keeps the instance awake
// until idle connections are closed, and the timeouts turn any connection that still goes bad into an error
// instead of a page that never finishes loading.
const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    query_timeout: 20_000,
    keepAlive: true,
  });
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;
// An idle connection dropped by the pooler emits here; without a listener it would crash the process.
pool.on("error", (err) => console.error("Idle database connection failed", err));
attachDatabasePool(pool);

export const db = drizzle(pool, { schema });
