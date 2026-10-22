import { describe, expect, it } from "vitest";

import { buildApp } from "./app.js";

describe("GET /healthz", () => {
  it("reports liveness without touching dependencies", async () => {
    const app = buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" });

    const res = await app.inject({ method: "GET", url: "/healthz" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    expect(res.headers["x-request-id"]).toBeTypeOf("string");
    await app.close();
  });
});

describe("GET /readyz", () => {
  it("returns 503 UNAVAILABLE when no pool is configured", async () => {
    const app = buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" });

    const res = await app.inject({ method: "GET", url: "/readyz" });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: { code: "UNAVAILABLE" } });
    await app.close();
  });
});

describe("GET /healthz/deps", () => {
  it("reports postgres error and redis disabled without a pool", async () => {
    const app = buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" });

    const res = await app.inject({ method: "GET", url: "/healthz/deps" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ postgres: "error", redis: "disabled" });
    await app.close();
  });
});

describe("unknown routes", () => {
  it("returns 404 for GET /v1/__probe without a key", async () => {
    const app = buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" });

    const res = await app.inject({ method: "GET", url: "/v1/__probe" });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
