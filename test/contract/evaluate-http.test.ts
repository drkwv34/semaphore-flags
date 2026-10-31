import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import type { JsonPrimitive, RuleOp } from "../../src/domain/rules/index.js";
import { mintApiKey } from "../../src/services/api-keys.js";
import {
  archiveFlag,
  findEnvironmentByKey,
  insertApiKey,
  insertEnvironment,
  insertFlag,
  insertFlagEnvConfig,
  insertProject,
  insertRule,
  withTx,
  type Pool,
} from "../../src/store/index.js";
import { withTestPool } from "../integration/helpers.js";
import { assertConformsToOpenApi, stripVolatile } from "./openapi-validator.js";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../contracts/evaluate",
);

interface SetupFlag {
  key: string;
  archived: boolean;
  default_value: boolean;
  enabled: boolean;
  percentage: number;
  rules: readonly {
    attribute: string;
    op: RuleOp;
    value: unknown;
    serve: boolean;
  }[];
}

export interface EvaluateFixture {
  name: string;
  auth: "evaluate" | "admin" | "none";
  setup: { salt: string; env: string; flags: readonly SetupFlag[] };
  request: { method: string; url: string; body?: unknown };
  response: { status: number; body: Record<string, unknown> };
}

const REQUIRED_NAMES = [
  "admin key is forbidden on evaluate",
  "archived flag is false",
  "batch partial not_found is 200",
  "bucket 0 is in at percentage 1",
  "bucket 99 is out at percentage 99",
  "first matching rule wins",
  "kill switch disabled in prod",
  "missing attribute does not match",
  "missing flag is not_found",
] as const;

export async function loadEvaluateFixtures(): Promise<EvaluateFixture[]> {
  const files = (await readdir(fixturesDir))
    .filter((name) => name.endsWith(".json") && name !== "bucket-vectors.json")
    .sort();
  const fixtures: EvaluateFixture[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(fixturesDir, file), "utf8");
    fixtures.push(JSON.parse(raw) as EvaluateFixture);
  }
  return fixtures;
}

const fixtures = await loadEvaluateFixtures();

async function seedFixture(
  pool: Pool,
  fixture: EvaluateFixture,
): Promise<{ evalRaw: string; adminRaw: string }> {
  const evalKey = mintApiKey("evaluate");
  const adminKey = mintApiKey("admin");
  const slug = `fx-${randomBytes(6).toString("hex")}`;
  await withTx(pool, async (tx) => {
    const project = await insertProject(tx, {
      name: fixture.name.slice(0, 100),
      slug,
      salt: fixture.setup.salt,
    });
    await insertEnvironment(tx, { projectId: project.id, key: fixture.setup.env });
    await insertApiKey(tx, {
      projectId: project.id,
      type: evalKey.type,
      prefix: evalKey.prefix,
      keyHash: evalKey.keyHash,
    });
    await insertApiKey(tx, {
      projectId: project.id,
      type: adminKey.type,
      prefix: adminKey.prefix,
      keyHash: adminKey.keyHash,
    });
    for (const flag of fixture.setup.flags) {
      const row = await insertFlag(tx, {
        projectId: project.id,
        key: flag.key,
        description: "",
        defaultValue: flag.default_value,
        clientFallback: "fail_closed",
      });
      const env = await findEnvironmentByKey(tx, project.id, fixture.setup.env);
      if (env === undefined) throw new Error(`missing env ${fixture.setup.env}`);
      await insertFlagEnvConfig(tx, {
        flagId: row.id,
        environmentId: env.id,
        enabled: flag.enabled,
        percentage: flag.percentage,
      });
      for (const [index, rule] of flag.rules.entries()) {
        await insertRule(tx, {
          flagId: row.id,
          environmentId: env.id,
          priority: index,
          attribute: rule.attribute,
          op: rule.op,
          value: rule.value as JsonPrimitive | readonly JsonPrimitive[],
          serve: rule.serve,
        });
      }
      if (flag.archived) await archiveFlag(tx, row.id);
    }
  });
  return { evalRaw: evalKey.raw, adminRaw: adminKey.raw };
}

describe("evaluate HTTP contract fixtures against Postgres (FR-EVAL-005)", () => {
  it("requires DATABASE_URL so CI cannot skip the live runner", () => {
    expect(
      process.env.DATABASE_URL,
      "DATABASE_URL is required for live contract tests",
    ).toBeTruthy();
  });

  it("includes the required golden cases including buckets 0 and 99", async () => {
    const fixtures = await loadEvaluateFixtures();
    const names = fixtures.map((fixture) => fixture.name);
    for (const required of REQUIRED_NAMES) {
      expect(names, required).toContain(required);
    }
    const bucket0 = fixtures.find((fixture) => fixture.name === "bucket 0 is in at percentage 1");
    const bucket99 = fixtures.find(
      (fixture) => fixture.name === "bucket 99 is out at percentage 99",
    );
    expect(bucket0?.setup.salt).toBe("fixture-salt");
    expect(bucket0?.request.body).toMatchObject({ user: { id: "user-76" } });
    expect(bucket99?.setup.salt).toBe("fixture-salt");
    expect(bucket99?.request.body).toMatchObject({ user: { id: "user-39" } });
  });

  it.each(fixtures)("$name", async (fixture) => {
    await withTestPool(async (pool) => {
      const keys = await seedFixture(pool, fixture);
      const redisUrl = process.env.REDIS_URL;
      const app = await buildApp(
        { NODE_ENV: "test", LOG_LEVEL: "info" },
        {
          pool,
          ...(redisUrl !== undefined && redisUrl !== "" ? { redisUrl } : {}),
        },
      );
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (fixture.auth === "evaluate") headers.authorization = `Bearer ${keys.evalRaw}`;
      if (fixture.auth === "admin") headers.authorization = `Bearer ${keys.adminRaw}`;

      const res = await app.inject({
        method: fixture.request.method as "POST",
        url: fixture.request.url,
        headers,
        payload: fixture.request.body as object,
      });
      expect(res.statusCode, fixture.name).toBe(fixture.response.status);

      const payload: unknown = res.headers["content-type"]?.toString().includes("application/json")
        ? res.json()
        : res.body;
      expect(stripVolatile(payload), fixture.name).toEqual(stripVolatile(fixture.response.body));
      await assertConformsToOpenApi({
        method: fixture.request.method,
        url: fixture.request.url,
        status: res.statusCode,
        body: payload,
        contentType: res.headers["content-type"]?.toString(),
      });
      await app.close();
    });
  });
});
