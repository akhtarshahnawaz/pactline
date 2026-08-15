import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const { Client } = pg;
const client = new Client({
  connectionString,
  ssl:
    process.env.NODE_ENV === "production" &&
    !connectionString.includes("railway.internal")
      ? { rejectUnauthorized: false }
      : undefined,
});

const migrationsDirectory = path.resolve("drizzle");

await client.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS pactline_migrations (
      id text PRIMARY KEY,
      hash text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDirectory))
    .filter((file) => /^\d+.*\.sql$/.test(file))
    .sort();

  for (const file of files) {
    const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    const existing = await client.query(
      "SELECT hash FROM pactline_migrations WHERE id = $1",
      [file],
    );

    if (existing.rows[0]) {
      if (existing.rows[0].hash !== hash) {
        throw new Error(
          `Migration ${file} changed after it was applied. Create a new migration instead.`,
        );
      }
      continue;
    }

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO pactline_migrations (id, hash) VALUES ($1, $2)",
        [file, hash],
      );
      await client.query("COMMIT");
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  console.log("Database migrations are current.");
} finally {
  await client.end();
}
