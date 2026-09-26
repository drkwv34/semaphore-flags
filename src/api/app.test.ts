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
