import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";

const fixturePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../contracts/ops/healthz-deps.json",
);

interface Fixture {
  name: string;
  request: { method: string; url: string };
  response: { status: number; body: Record<string, unknown> };
}

describe("ops contract fixtures (FR-OPS-001/002)", () => {
  it("documents GET /healthz/deps statuses", async () => {
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as Fixture;
    const app = buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" });
    const res = await app.inject({
      method: "GET",
      url: fixture.request.url,
    });
    expect(res.statusCode).toBe(fixture.response.status);
    expect(res.json()).toEqual(fixture.response.body);
    await app.close();
  });

  it("exposes GET /metrics as Prometheus text", async () => {
    const app = buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" });
    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("# HELP semaphore_evaluate_total");
    await app.close();
  });
});
