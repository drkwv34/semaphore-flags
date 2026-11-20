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
  it.each(["/", "/admin", "/v1/environments", "/v1/no-such-route", "/v1/__probe"] as const)(
    "returns NOT_FOUND envelope for GET %s",
    async (url) => {
      const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" });

      const generated = await app.inject({ method: "GET", url });
      expect(generated.statusCode).toBe(404);
      expect(generated.json()).toEqual({
        error: {
          code: "NOT_FOUND",
          message: "Route not found",
          request_id: generated.headers["x-request-id"],
        },
      });

      const echoed = await app.inject({
        method: "GET",
        url,
        headers: { "x-request-id": "req-fixed" },
      });
      expect(echoed.statusCode).toBe(404);
      expect(echoed.headers["x-request-id"]).toBe("req-fixed");
      expect(echoed.json()).toEqual({
        error: {
          code: "NOT_FOUND",
          message: "Route not found",
          request_id: "req-fixed",
        },
      });
      await app.close();
    },
  );

  it("does not use Fastify's default 404 body", async () => {
    const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" });
    const res = await app.inject({ method: "GET", url: "/" });
    expect(res.json()).not.toHaveProperty("statusCode");
    expect(res.json()).not.toHaveProperty("error", "Not Found");
    await app.close();
  });
});
