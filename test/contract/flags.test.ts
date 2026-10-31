import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import {
  createFlagBodySchema,
  envConfigSchema,
  flagDetailSchema,
  putEnvBodySchema,
} from "../../src/api/flag-schemas.js";
import { errorEnvelopeSchema } from "../../src/api/schemas.js";
import { assertConformsToOpenApi } from "./openapi-validator.js";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../contracts/flags",
);

interface Fixture {
  name: string;
  request: { method: string; url: string; body?: unknown };
  response: { status: number; body: Record<string, unknown> };
}

async function loadFixtures(): Promise<Fixture[]> {
  const files = (await readdir(fixturesDir)).filter((name) => name.endsWith(".json")).sort();
  const fixtures: Fixture[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(fixturesDir, file), "utf8");
    fixtures.push(JSON.parse(raw) as Fixture);
  }
  return fixtures;
}

async function schemaStatus(schema: object, payload: unknown): Promise<number> {
  const app = Fastify({ logger: false });
  app.post("/", { schema: { body: schema } }, () => ({ ok: true }));
  const res = await app.inject({ method: "POST", url: "/", payload: payload as object });
  await app.close();
  return res.statusCode;
}

async function responseAccepted(schema: object, body: unknown): Promise<boolean> {
  const app = Fastify({ logger: false });
  app.get("/", { schema: { response: { 200: schema } } }, () => body);
  const res = await app.inject({ method: "GET", url: "/" });
  await app.close();
  return res.statusCode === 200;
}

describe("flag contract fixtures", () => {
  it("are present and match exported JSON schemas", async () => {
    const fixtures = await loadFixtures();
    expect(fixtures.map((f) => f.name).sort()).toEqual([
      "create flag",
      "evaluate key is forbidden on flag routes",
      "invalid rule returns field errors",
      "replace env config with ordered rules",
    ]);

    for (const fixture of fixtures) {
      expect(fixture.request.method).toMatch(/^(GET|POST|PUT|PATCH)$/);
      expect(fixture.request.url).toMatch(/^\/v1\/flags/);
      expect(fixture.response.status).toBeGreaterThanOrEqual(200);
      await assertConformsToOpenApi({
        method: fixture.request.method,
        url: fixture.request.url,
        status: fixture.response.status,
        body: fixture.response.body,
      });
    }

    const create = fixtures.find((f) => f.name === "create flag");
    expect(create).toBeDefined();
    expect(await schemaStatus(createFlagBodySchema, create?.request.body)).toBe(200);
    expect(await responseAccepted(flagDetailSchema, create?.response.body)).toBe(true);

    const put = fixtures.find((f) => f.name === "replace env config with ordered rules");
    expect(await schemaStatus(putEnvBodySchema, put?.request.body)).toBe(200);
    expect(await responseAccepted(envConfigSchema, put?.response.body)).toBe(true);

    const invalid = fixtures.find((f) => f.name === "invalid rule returns field errors");
    expect(await schemaStatus(putEnvBodySchema, invalid?.request.body)).toBe(200);
    expect(await responseAccepted(errorEnvelopeSchema, invalid?.response.body)).toBe(true);

    const forbidden = fixtures.find((f) => f.name === "evaluate key is forbidden on flag routes");
    expect(await responseAccepted(errorEnvelopeSchema, forbidden?.response.body)).toBe(true);

    expect(await schemaStatus(createFlagBodySchema, { default_value: false })).toBe(400);
    expect(
      await schemaStatus(putEnvBodySchema, { enabled: true, percentage: 50, extra: true }),
    ).toBe(400);
  });
});
