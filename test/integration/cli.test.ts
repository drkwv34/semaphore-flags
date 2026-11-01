import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createPool } from "../../src/store/index.js";
import { withTestDatabase } from "./helpers.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tsxBin = path.join(repoRoot, "node_modules/.bin/tsx");
const cli = path.join(repoRoot, "src/cli.ts");

async function semaphore(
  databaseUrl: string,
  args: string[],
  extraEnv: Record<string, string> = {},
) {
  return execFileAsync(tsxBin, [cli, ...args], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: "test", ...extraEnv },
  });
}

describe("semaphore CLI (FR-PROJ-001)", () => {
  it("migrate is idempotent and projects create prints keys once as hashes in the db", async () => {
    await withTestDatabase(async (databaseUrl) => {
      const first = await semaphore(databaseUrl, ["migrate"]);
      expect(first.stdout).toContain("0001_projects_keys_envs.sql");
      expect(first.stdout).toContain("0002_flags_rules_audit.sql");
      const second = await semaphore(databaseUrl, ["migrate"]);
      expect(second.stdout).toContain("already up to date");

      const created = await semaphore(databaseUrl, [
        "projects",
        "create",
        "--name",
        "Acme",
        "--slug",
        "acme",
      ]);
      const admin = /admin key \(shown once\): (sf_admin_[0-9a-f]{8}_[0-9a-f]{64})/.exec(
        created.stdout,
      );
      const evaluate = /evaluate key \(shown once\): (sf_eval_[0-9a-f]{8}_[0-9a-f]{64})/.exec(
        created.stdout,
      );
      expect(admin?.[1]).toBeDefined();
      expect(evaluate?.[1]).toBeDefined();

      const pool = createPool(databaseUrl);
      const hashes = await pool.query<{ key_hash: string; prefix: string }>(
        "SELECT key_hash, prefix FROM api_keys",
      );
      expect(hashes.rows).toHaveLength(2);
      expect(hashes.rows.every((row) => !created.stdout.includes(row.key_hash))).toBe(true);
      expect(hashes.rows.every((row) => created.stdout.includes(row.prefix))).toBe(true);
      const rawStored = await pool.query("SELECT * FROM api_keys");
      expect(JSON.stringify(rawStored.rows)).not.toContain(admin?.[1] ?? "missing");
      await pool.end();
    });
  });

  it("seed is idempotent and does not reprint keys on the second run", async () => {
    await withTestDatabase(async (databaseUrl) => {
      await semaphore(databaseUrl, ["migrate"]);
      const keysDir = await mkdtemp(path.join(tmpdir(), "semaphore-seed-file-"));
      const keysPath = path.join(keysDir, "demo-keys.json");
      const first = await semaphore(databaseUrl, ["seed"], { SEED_KEYS_PATH: keysPath });
      expect(first.stdout).toMatch(/admin key \(shown once\): sf_admin_/);
      expect(first.stdout).toMatch(/evaluate key \(shown once\): sf_eval_/);
      const stored: unknown = JSON.parse(await readFile(keysPath, "utf8"));
      if (
        typeof stored !== "object" ||
        stored === null ||
        !("admin_key" in stored) ||
        !("evaluate_key" in stored) ||
        typeof stored.admin_key !== "string" ||
        typeof stored.evaluate_key !== "string"
      ) {
        throw new Error("seed key file shape");
      }
      expect(stored.admin_key).toMatch(/^sf_admin_[0-9a-f]{8}_[0-9a-f]{64}$/u);
      expect(stored.evaluate_key).toMatch(/^sf_eval_[0-9a-f]{8}_[0-9a-f]{64}$/u);

      const second = await semaphore(databaseUrl, ["seed"]);
      expect(second.stdout).toContain("already exists; keys not re-printed");
      expect(second.stdout).not.toMatch(/admin key \(shown once\):/);

      const pool = createPool(databaseUrl);
      const keys = await pool.query("SELECT id FROM api_keys");
      expect(keys.rows).toHaveLength(2);
      const envs = await pool.query("SELECT key FROM environments ORDER BY key");
      expect(envs.rows.map((row: { key: string }) => row.key)).toEqual(["dev", "prod", "staging"]);
      const flags = await pool.query<{ key: string }>("SELECT key FROM flags ORDER BY key");
      expect(flags.rows.map((row) => row.key)).toEqual([
        "beta_ui",
        "checkout_v2",
        "kill_payments",
        "kill_switch",
      ]);
      const checkoutDev = await pool.query<{ enabled: boolean; percentage: number }>(
        `SELECT c.enabled, c.percentage
         FROM flag_env_configs c
         JOIN flags f ON f.id = c.flag_id
         JOIN environments e ON e.id = c.environment_id
         WHERE f.key = 'checkout_v2' AND e.key = 'dev'`,
      );
      expect(checkoutDev.rows[0]).toMatchObject({ enabled: true, percentage: 50 });
      const rules = await pool.query("SELECT id FROM rules");
      expect(rules.rows).toHaveLength(2);
      const betaStaging = await pool.query<{
        enabled: boolean;
        percentage: number;
        attribute: string;
        op: string;
        value: unknown;
      }>(
        `SELECT c.enabled, c.percentage, r.attribute, r.op, r.value
         FROM flag_env_configs c
         JOIN flags f ON f.id = c.flag_id
         JOIN environments e ON e.id = c.environment_id
         JOIN rules r ON r.flag_id = f.id AND r.environment_id = e.id
         WHERE f.key = 'beta_ui' AND e.key = 'staging'`,
      );
      expect(betaStaging.rows[0]).toMatchObject({
        enabled: true,
        percentage: 10,
        attribute: "user.id",
        op: "in",
      });
      expect(betaStaging.rows[0]?.value).toEqual(["demo_in"]);
      const killPaymentsProd = await pool.query<{ enabled: boolean; percentage: number }>(
        `SELECT c.enabled, c.percentage
         FROM flag_env_configs c
         JOIN flags f ON f.id = c.flag_id
         JOIN environments e ON e.id = c.environment_id
         WHERE f.key = 'kill_payments' AND e.key = 'prod'`,
      );
      expect(killPaymentsProd.rows[0]).toMatchObject({ enabled: false, percentage: 0 });
      const flagsAgain = await pool.query("SELECT id FROM flags");
      expect(flagsAgain.rows).toHaveLength(4);
      await pool.end();
    });
  });
});
