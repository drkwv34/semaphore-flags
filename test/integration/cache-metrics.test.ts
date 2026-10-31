import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import { createMetrics } from "../../src/metrics/index.js";
import { createProjectWithKeys } from "../../src/services/projects.js";
import { withTestPool } from "./helpers.js";

function redisUrl(): string {
  const url = process.env.REDIS_URL;
  if (url === undefined || url === "") {
    throw new Error("REDIS_URL is required for cache integration tests");
  }
  return url;
}

function badRedisUrl(): string {
  return "redis://127.0.0.1:1";
}

describe("cache + metrics + logs (FR-CACHE-001..004, FR-OPS-001..003)", () => {
  it("invalidates after mutation so single and batch evaluate see the new value", async () => {
    await withTestPool(async (pool) => {
      const created = await createProjectWithKeys(pool, { name: "Cache", slug: "cache-proj" });
      const app = await buildApp(
        { NODE_ENV: "test", LOG_LEVEL: "info" },
        { pool, redisUrl: redisUrl() },
      );
      const admin = {
        authorization: `Bearer ${created.adminKey.raw}`,
        "content-type": "application/json",
      };
      const evaluate = {
        authorization: `Bearer ${created.evaluateKey.raw}`,
        "content-type": "application/json",
      };

      const createdFlag = await app.inject({
        method: "POST",
        url: "/v1/flags",
        headers: admin,
        payload: { key: "rollout_flag", default_value: false },
      });
      expect(createdFlag.statusCode).toBe(201);

      const enabled = await app.inject({
        method: "PUT",
        url: "/v1/flags/rollout_flag/envs/dev",
        headers: admin,
        payload: { enabled: true, percentage: 0, rules: [] },
      });
      expect(enabled.statusCode).toBe(200);

      const before = await app.inject({
        method: "POST",
        url: "/v1/evaluate",
        headers: evaluate,
        payload: { flag_key: "rollout_flag", env: "dev", user: { id: "u1" } },
      });
      expect(before.statusCode).toBe(200);
      expect(before.json()).toMatchObject({ reason: "percentage_out", value: false });

      const mutated = await app.inject({
        method: "PUT",
        url: "/v1/flags/rollout_flag/envs/dev",
        headers: admin,
        payload: { enabled: true, percentage: 100, rules: [] },
      });
      expect(mutated.statusCode).toBe(200);

      const after = await app.inject({
        method: "POST",
        url: "/v1/evaluate",
        headers: evaluate,
        payload: { flag_key: "rollout_flag", env: "dev", user: { id: "u1" } },
      });
      expect(after.statusCode).toBe(200);
      expect(after.json()).toMatchObject({ reason: "percentage_in", value: true });

      const batch = await app.inject({
        method: "POST",
        url: "/v1/evaluate-batch",
        headers: evaluate,
        payload: { env: "dev", user: { id: "u1" }, flag_keys: ["rollout_flag"] },
      });
      expect(batch.statusCode).toBe(200);
      expect(batch.json()).toMatchObject({
        rollout_flag: { reason: "percentage_in", value: true },
      });

      const archived = await app.inject({
        method: "POST",
        url: "/v1/flags/rollout_flag/archive",
        headers: { authorization: `Bearer ${created.adminKey.raw}` },
      });
      expect(archived.statusCode).toBe(200);
      const afterArchive = await app.inject({
        method: "POST",
        url: "/v1/evaluate",
        headers: evaluate,
        payload: { flag_key: "rollout_flag", env: "dev", user: { id: "u1" } },
      });
      expect(afterArchive.json()).toMatchObject({ reason: "archived", value: false });

      const metrics = await app.inject({ method: "GET", url: "/metrics" });
      expect(metrics.statusCode).toBe(200);
      expect(metrics.body).toContain("semaphore_evaluate_total");
      expect(metrics.body).toContain('reason="percentage_in"');
      expect(metrics.body).toContain("semaphore_admin_mutations_total");
      expect(metrics.body).toContain("semaphore_cache_requests_total");

      await app.close();
    });
  });

  it("records a cache hit after the first evaluate", async () => {
    await withTestPool(async (pool) => {
      const created = await createProjectWithKeys(pool, { name: "Hit", slug: "hit-proj" });
      const app = await buildApp(
        { NODE_ENV: "test", LOG_LEVEL: "info" },
        { pool, redisUrl: redisUrl() },
      );
      const admin = {
        authorization: `Bearer ${created.adminKey.raw}`,
        "content-type": "application/json",
      };
      const evaluate = {
        authorization: `Bearer ${created.evaluateKey.raw}`,
        "content-type": "application/json",
      };
      await app.inject({
        method: "POST",
        url: "/v1/flags",
        headers: admin,
        payload: { key: "hit_flag", default_value: false },
      });

      const first = await app.inject({
        method: "POST",
        url: "/v1/evaluate",
        headers: evaluate,
        payload: { flag_key: "hit_flag", env: "dev", user: { id: "u1" } },
      });
      expect(first.statusCode).toBe(200);
      const second = await app.inject({
        method: "POST",
        url: "/v1/evaluate",
        headers: evaluate,
        payload: { flag_key: "hit_flag", env: "dev", user: { id: "u1" } },
      });
      expect(second.statusCode).toBe(200);
      expect(second.json()).toEqual(first.json());

      const metrics = await app.inject({ method: "GET", url: "/metrics" });
      expect(metrics.body).toMatch(/semaphore_cache_requests_total\{result="hit"\} /);
      expect(metrics.body).toMatch(/semaphore_cache_requests_total\{result="miss"\} /);
      await app.close();
    });
  });

  it("degrades to Postgres when Redis is unreachable and reports redis degraded", async () => {
    await withTestPool(async (pool) => {
      const created = await createProjectWithKeys(pool, { name: "Down", slug: "down-proj" });
      const app = await buildApp(
        { NODE_ENV: "test", LOG_LEVEL: "info" },
        { pool, redisUrl: badRedisUrl() },
      );
      const admin = {
        authorization: `Bearer ${created.adminKey.raw}`,
        "content-type": "application/json",
      };
      const evaluate = {
        authorization: `Bearer ${created.evaluateKey.raw}`,
        "content-type": "application/json",
      };

      const createdFlag = await app.inject({
        method: "POST",
        url: "/v1/flags",
        headers: admin,
        payload: { key: "down_flag", default_value: false },
      });
      expect(createdFlag.statusCode).toBe(201);

      const evalRes = await app.inject({
        method: "POST",
        url: "/v1/evaluate",
        headers: evaluate,
        payload: { flag_key: "down_flag", env: "dev", user: { id: "u1" } },
      });
      expect(evalRes.statusCode).toBe(200);
      expect(evalRes.json()).toMatchObject({ reason: "disabled", value: false });

      const batch = await app.inject({
        method: "POST",
        url: "/v1/evaluate-batch",
        headers: evaluate,
        payload: { env: "dev", user: { id: "u1" }, flag_keys: ["down_flag"] },
      });
      expect(batch.statusCode).toBe(200);

      const deps = await app.inject({ method: "GET", url: "/healthz/deps" });
      expect(deps.statusCode).toBe(200);
      expect(deps.json()).toEqual({ postgres: "ok", redis: "degraded" });

      const ready = await app.inject({ method: "GET", url: "/readyz" });
      expect(ready.statusCode).toBe(200);

      await app.close();
    });
  });

  it("echoes x-request-id and writes it on a JSON log line", async () => {
    await withTestPool(async (pool) => {
      const created = await createProjectWithKeys(pool, { name: "Logs", slug: "logs-proj" });
      const chunks: string[] = [];
      const app = await buildApp(
        { NODE_ENV: "development", LOG_LEVEL: "info" },
        {
          pool,
          metrics: createMetrics(),
          logDestination: {
            write(chunk: string) {
              chunks.push(chunk);
            },
          },
        },
      );
      const requestId = "req-cache-metrics-1";
      const res = await app.inject({
        method: "POST",
        url: "/v1/evaluate",
        headers: {
          authorization: `Bearer ${created.evaluateKey.raw}`,
          "content-type": "application/json",
          "x-request-id": requestId,
        },
        payload: { flag_key: "missing_flag", env: "dev", user: { id: "u1" } },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers["x-request-id"]).toBe(requestId);

      const lines = chunks
        .join("")
        .split("\n")
        .filter((line) => line.length > 0);
      const parsed = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
      const withId = parsed.find((row) => row.request_id === requestId);
      expect(withId).toBeDefined();
      expect(withId?.flag_key).toBe("missing_flag");
      expect(withId?.reason).toBe("not_found");
      expect(withId?.project_id).toBe(created.project.id);
      expect(typeof withId?.duration_ms).toBe("number");
      await app.close();
    });
  });
});
