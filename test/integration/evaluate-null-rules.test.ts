import { Redis } from "ioredis";
import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import { cacheKey, deserializeSnapshot } from "../../src/cache/index.js";
import { createProjectWithKeys } from "../../src/services/projects.js";
import type { FlagDetailJson } from "../../src/services/flags.js";
import { loadEnvSnapshot } from "../../src/store/index.js";
import { withTestPool } from "./helpers.js";

function json(res: { json: () => unknown }): unknown {
  return res.json();
}

function redisUrl(): string {
  const url = process.env.REDIS_URL;
  if (url === undefined || url === "") {
    throw new Error("REDIS_URL is required for cached snapshot coverage");
  }
  return url;
}

async function putEnabledRules(
  app: Awaited<ReturnType<typeof buildApp>>,
  headers: Record<string, string>,
  key: string,
  rules: readonly Record<string, unknown>[],
): Promise<void> {
  const created = await app.inject({
    method: "POST",
    url: "/v1/flags",
    headers,
    payload: { key, default_value: false },
  });
  expect(created.statusCode).toBe(201);
  const put = await app.inject({
    method: "PUT",
    url: `/v1/flags/${key}/envs/dev`,
    headers,
    payload: { enabled: true, percentage: 0, rules },
  });
  expect(put.statusCode).toBe(200);
}

async function evaluateFlag(
  app: Awaited<ReturnType<typeof buildApp>>,
  headers: Record<string, string>,
  flagKey: string,
  attrs: Record<string, unknown>,
): Promise<unknown> {
  const res = await app.inject({
    method: "POST",
    url: "/v1/evaluate",
    headers,
    payload: { flag_key: flagKey, env: "dev", user: { id: "u-null", attrs } },
  });
  expect(res.statusCode).toBe(200);
  return json(res);
}

async function assertNullScalarRules(opts: { readonly redisUrl?: string }): Promise<void> {
  await withTestPool(async (pool) => {
    const created = await createProjectWithKeys(pool, {
      name: "Null rules",
      slug: `null-rules-${opts.redisUrl === undefined ? "pg" : "redis"}`,
    });
    const app = await buildApp(
      { NODE_ENV: "test", LOG_LEVEL: "info" },
      {
        pool,
        ...(opts.redisUrl !== undefined ? { redisUrl: opts.redisUrl } : {}),
      },
    );
    const admin = {
      authorization: `Bearer ${created.adminKey.raw}`,
      "content-type": "application/json",
    };
    const evaluate = {
      authorization: `Bearer ${created.evaluateKey.raw}`,
      "content-type": "application/json",
    };

    await putEnabledRules(app, admin, "null_eq", [
      { priority: 0, attribute: "user.x", op: "eq", value: null, serve: true },
    ]);
    await putEnabledRules(app, admin, "null_neq", [
      { priority: 0, attribute: "user.x", op: "neq", value: null, serve: true },
    ]);

    const gotEq = await app.inject({
      method: "GET",
      url: "/v1/flags/null_eq",
      headers: admin,
    });
    expect(gotEq.statusCode).toBe(200);
    const eqDetail = json(gotEq) as FlagDetailJson;
    const eqDev = eqDetail.envs.find((env) => env.key === "dev");
    expect(eqDev?.rules).toEqual([
      expect.objectContaining({
        attribute: "user.x",
        op: "eq",
        value: null,
        serve: true,
      }),
    ]);

    const gotNeq = await app.inject({
      method: "GET",
      url: "/v1/flags/null_neq",
      headers: admin,
    });
    expect(gotNeq.statusCode).toBe(200);
    const neqDetail = json(gotNeq) as FlagDetailJson;
    const neqDev = neqDetail.envs.find((env) => env.key === "dev");
    expect(neqDev?.rules).toEqual([
      expect.objectContaining({
        attribute: "user.x",
        op: "neq",
        value: null,
        serve: true,
      }),
    ]);

    const eqMatch = await evaluateFlag(app, evaluate, "null_eq", { x: null });
    expect(eqMatch).toMatchObject({ value: true, reason: "rule_match" });

    const neqMatch = await evaluateFlag(app, evaluate, "null_neq", { x: "present" });
    expect(neqMatch).toMatchObject({ value: true, reason: "rule_match" });

    const snapshot = await loadEnvSnapshot(pool, created.project.id, "dev");
    expect(snapshot?.flags.get("null_eq")?.rules).toEqual([
      { attribute: "user.x", op: "eq", value: null, serve: true },
    ]);
    expect(snapshot?.flags.get("null_neq")?.rules).toEqual([
      { attribute: "user.x", op: "neq", value: null, serve: true },
    ]);

    if (opts.redisUrl !== undefined) {
      const redis = new Redis(opts.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
      try {
        const raw = await redis.get(cacheKey(created.project.id, "dev"));
        expect(raw).toEqual(expect.any(String));
        const cached = deserializeSnapshot(raw as string);
        expect(cached?.flags.get("null_eq")?.rules).toEqual([
          { attribute: "user.x", op: "eq", value: null, serve: true },
        ]);
        expect(cached?.flags.get("null_neq")?.rules).toEqual([
          { attribute: "user.x", op: "neq", value: null, serve: true },
        ]);
      } finally {
        redis.disconnect();
      }
    }

    await app.close();
  });
}

describe("JSON null scalar rules (FR-RULE-001, FR-EVAL-002, FR-CACHE-001)", () => {
  it("matches eq/neq null from Postgres when Redis is unset", async () => {
    await assertNullScalarRules({});
  });

  it("matches eq/neq null and keeps the rule in the Redis snapshot", async () => {
    await assertNullScalarRules({ redisUrl: redisUrl() });
  });
});
