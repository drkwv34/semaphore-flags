import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";

describe("GET /healthz", () => {
  it("reports liveness without touching dependencies", async () => {
    const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" });

    const res = await app.inject({ method: "GET", url: "/healthz" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    expect(res.headers["x-request-id"]).toBeTypeOf("string");
    await app.close();
  });
});

describe("GET /readyz", () => {
  it("returns 503 UNAVAILABLE when no pool is configured", async () => {
    const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" });

    const res = await app.inject({ method: "GET", url: "/readyz" });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: { code: "UNAVAILABLE" } });
    await app.close();
  });
});

describe("GET /healthz/deps", () => {
  it("reports postgres error and redis disabled without a pool", async () => {
    const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" });

    const res = await app.inject({ method: "GET", url: "/healthz/deps" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ postgres: "degraded", redis: "disabled" });
    await app.close();
  });

  it("reports redis degraded when configured but unreachable", async () => {
    const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" }, { redisConfigured: true });

    const res = await app.inject({ method: "GET", url: "/healthz/deps" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ postgres: "degraded", redis: "degraded" });
    await app.close();
  });
});

describe("GET /metrics", () => {
  it("returns Prometheus text", async () => {
    const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" });

    const res = await app.inject({ method: "GET", url: "/metrics" });

    expect(res.statusCode).toBe(200);
    expect(String(res.headers["content-type"])).toMatch(/text\/plain/);
    expect(res.body).toContain("semaphore_evaluate_total");
    expect(res.body).toContain("semaphore_evaluate_duration_seconds");
    expect(res.body).toContain("semaphore_admin_mutations_total");
    expect(res.body).toContain("semaphore_cache_requests_total");
    await app.close();
  });
});

describe("unknown routes", () => {
  it("returns 404 for GET /v1/__probe without a key", async () => {
    const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" });

    const res = await app.inject({ method: "GET", url: "/v1/__probe" });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
