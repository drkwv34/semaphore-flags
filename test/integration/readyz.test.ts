import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import { createPool } from "../../src/store/index.js";
import { withTestPool } from "./helpers.js";

describe("GET /readyz (FR-OPS-001)", () => {
  it("returns 200 when Postgres answers", async () => {
    await withTestPool(async (pool) => {
      const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" }, { pool });
      const res = await app.inject({ method: "GET", url: "/readyz" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: "ok" });
      const deps = await app.inject({ method: "GET", url: "/healthz/deps" });
      expect(deps.statusCode).toBe(200);
      expect(deps.json()).toMatchObject({ postgres: "ok", redis: "disabled" });
      await app.close();
    });
  });

  it("returns 503 when the pool cannot reach Postgres", async () => {
    const pool = createPool("postgres://semaphore:semaphore@127.0.0.1:1/semaphore");
    const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" }, { pool });
    const res = await app.inject({ method: "GET", url: "/readyz" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: { code: "UNAVAILABLE" } });
    const live = await app.inject({ method: "GET", url: "/healthz" });
    expect(live.statusCode).toBe(200);
    await app.close();
    await pool.end();
  });
});
