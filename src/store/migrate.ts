import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { withClient, type Pool } from "./pool.js";

const LOCK_KEY_1 = 87231456;
const LOCK_KEY_2 = 1;

export function migrationsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../migrations");
}

async function listSqlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  return entries.filter((name) => name.endsWith(".sql")).sort();
}

export async function migrate(
  pool: Pool,
  dir: string = migrationsDir(),
): Promise<{ applied: string[] }> {
  return withClient(pool, async (db) => {
    await db.query("SELECT pg_advisory_lock($1, $2)", [LOCK_KEY_1, LOCK_KEY_2]);
    const applied: string[] = [];
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      const files = await listSqlFiles(dir);
      const existing = await db.query<{ version: string }>("SELECT version FROM schema_migrations");
      const done = new Set(existing.rows.map((row) => row.version));

      for (const file of files) {
        if (done.has(file)) continue;
        const sql = await readFile(path.join(dir, file), "utf8");
        await db.query("BEGIN");
        try {
          await db.query(sql);
          await db.query("INSERT INTO schema_migrations (version) VALUES ($1)", [file]);
          await db.query("COMMIT");
          applied.push(file);
        } catch (err) {
          await db.query("ROLLBACK");
          throw err;
        }
      }
      return { applied };
    } finally {
      await db.query("SELECT pg_advisory_unlock($1, $2)", [LOCK_KEY_1, LOCK_KEY_2]);
    }
  });
}
