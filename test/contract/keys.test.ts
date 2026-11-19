import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { errorEnvelopeSchema } from "../../src/api/schemas.js";
import { keyListSchema, keyMetadataSchema } from "../../src/api/key-schemas.js";
import { buildApp } from "../../src/api/app.js";
import { mintApiKey } from "../../src/services/api-keys.js";
import type { ApiKeyRecord } from "../../src/store/index.js";
import { assertConformsToOpenApi } from "./openapi-validator.js";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../contracts/keys",
);

interface Fixture {
  name: string;
  request: { method: string; url: string; body?: unknown };
  response: { status: number; body: Record<string, unknown> };
}

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

async function loadFixtures(): Promise<Fixture[]> {
  const files = (await readdir(fixturesDir)).filter((name) => name.endsWith(".json")).sort();
  const fixtures: Fixture[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(fixturesDir, file), "utf8");
    fixtures.push(JSON.parse(raw) as Fixture);
  }
  return fixtures;
}

async function responseAccepted(schema: object, body: unknown): Promise<boolean> {
  const app = Fastify({ logger: false });
  app.get("/", { schema: { response: { 200: schema } } }, () => body);
  const res = await app.inject({ method: "GET", url: "/" });
  await app.close();
  return res.statusCode === 200;
}

function keyRecord(minted: ReturnType<typeof mintApiKey>, id: string): ApiKeyRecord {
  return {
    id,
    projectId: PROJECT_ID,
    type: minted.type,
    prefix: minted.prefix,
    keyHash: minted.keyHash,
    createdAt: new Date(0),
    revokedAt: null,
  };
}

describe("key contract fixtures (FR-PROJ-002, NFR-SEC-001)", () => {
  it("match exported JSON schemas and inject 403 for evaluate keys", async () => {
    const fixtures = await loadFixtures();
    expect(fixtures.map((f) => f.name).sort()).toEqual([
      "admin key list metadata",
      "admin revoke key",
      "evaluate key is forbidden on key routes",
      "unknown or foreign key is not found",
    ]);

    for (const fixture of fixtures) {
      expect(fixture.request.url).toMatch(/^\/v1\/keys/);
      await assertConformsToOpenApi({
        method: fixture.request.method,
        url: fixture.request.url,
        status: fixture.response.status,
        body: fixture.response.body,
      });
    }

    const list = fixtures.find((f) => f.name === "admin key list metadata");
    expect(await responseAccepted(keyListSchema, list?.response.body)).toBe(true);
    const revoke = fixtures.find((f) => f.name === "admin revoke key");
    expect(await responseAccepted(keyMetadataSchema, revoke?.response.body)).toBe(true);
    const forbidden = fixtures.find((f) => f.name === "evaluate key is forbidden on key routes");
    expect(await responseAccepted(errorEnvelopeSchema, forbidden?.response.body)).toBe(true);
    const missing = fixtures.find((f) => f.name === "unknown or foreign key is not found");
    expect(await responseAccepted(errorEnvelopeSchema, missing?.response.body)).toBe(true);

    const evalKey = mintApiKey("evaluate");
    const findApiKey = (prefix: string) =>
      Promise.resolve(prefix === evalKey.prefix ? keyRecord(evalKey, "eval-key") : undefined);
    const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" }, { findApiKey });
    const res = await app.inject({
      method: "GET",
      url: "/v1/keys",
      headers: { authorization: `Bearer ${evalKey.raw}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    await app.close();
  });
});
