import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://pactline:pactline@127.0.0.1:5432/pactline";

const globalForDatabase = globalThis as unknown as {
  pactlinePool?: Pool;
};

export const pool =
  globalForDatabase.pactlinePool ??
  new Pool({
    connectionString,
    max: process.env.NODE_ENV === "production" ? 10 : 3,
    ssl:
      process.env.NODE_ENV === "production" &&
      !connectionString.includes("railway.internal")
        ? { rejectUnauthorized: false }
        : undefined,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.pactlinePool = pool;
}

export const db = drizzle(pool, { schema });

export function getDb() {
  return db;
}
