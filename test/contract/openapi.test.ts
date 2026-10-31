import { describe, expect, it } from "vitest";

import { buildApp, buildDocumentedApp } from "../../src/api/app.js";
import { assertConformsToOpenApi } from "./openapi-validator.js";

describe("OpenAPI serving and ops schema conformance (NFR-MAINT-002)", () => {
  it("serves GET /openapi.json without a key", async () => {
    const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" });
    const res = await app.inject({ method: "GET", url: "/openapi.json" });
    expect(res.statusCode).toBe(200);
    expect(String(res.headers["content-type"])).toMatch(/json/);
    const body: unknown = res.json();
    expect(body).toBeTypeOf("object");
    expect(body).not.toBeNull();
    const record = body as Record<string, unknown>;
    expect(record["openapi"]).toBeTypeOf("string");
    expect(String(record["openapi"])).toMatch(/^3\./);
    const info = record["info"];
    expect(info).toBeTypeOf("object");
    expect(info).not.toBeNull();
    expect((info as Record<string, unknown>)["title"]).toBe("semaphore-flags");
    await app.close();
  });

  it("serves GET /docs without a key", async () => {
    const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" });
    const res = await app.inject({ method: "GET", url: "/docs" });
    expect(res.statusCode).toBe(200);
    expect(String(res.headers["content-type"])).toMatch(/html/);
    await app.close();
  });

  it("validates /healthz, /healthz/deps, and /metrics against OpenAPI", async () => {
    const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" });

    const healthz = await app.inject({ method: "GET", url: "/healthz" });
    expect(healthz.statusCode).toBe(200);
    await assertConformsToOpenApi({
      method: "GET",
      url: "/healthz",
      status: 200,
      body: healthz.json(),
    });

    const deps = await app.inject({ method: "GET", url: "/healthz/deps" });
    expect(deps.statusCode).toBe(200);
    expect(deps.json()).toEqual({ postgres: "degraded", redis: "disabled" });
    await assertConformsToOpenApi({
      method: "GET",
      url: "/healthz/deps",
      status: 200,
      body: deps.json(),
    });

    const metrics = await app.inject({ method: "GET", url: "/metrics" });
    expect(metrics.statusCode).toBe(200);
    await assertConformsToOpenApi({
      method: "GET",
      url: "/metrics",
      status: 200,
      body: metrics.body,
      contentType: metrics.headers["content-type"]?.toString(),
    });

    await app.close();
  });

  it("includes evaluate and health paths in the generated document", async () => {
    const app = await buildDocumentedApp();
    await app.ready();
    const doc = app.swagger();
    const paths = doc.paths ?? {};
    expect(paths["/v1/evaluate"]).toBeDefined();
    expect(paths["/v1/evaluate-batch"]).toBeDefined();
    expect(paths["/healthz"]).toBeDefined();
    expect(paths["/healthz/deps"]).toBeDefined();
    expect(paths["/metrics"]).toBeDefined();
    await app.close();
  });
});
