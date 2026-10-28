import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import { auditListQuerySchema, auditListSchema } from "../../src/api/audit-schemas.js";
import { errorEnvelopeSchema } from "../../src/api/schemas.js";
import { mintApiKey } from "../../src/services/api-keys.js";
import type { ApiKeyRecord } from "../../src/store/index.js";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../contracts/audit",
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

async function schemaStatus(schema: object, query: Record<string, string>): Promise<number> {
  const app = Fastify({ logger: false });
  app.get("/", { schema: { querystring: schema } }, () => ({ ok: true }));
  const res = await app.inject({ method: "GET", url: "/", query });
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

describe("audit contract fixtures (FR-AUD-003, NFR-SEC-001)", () => {
  it("match exported JSON schemas and inject 403 for evaluate keys", async () => {
    const fixtures = await loadFixtures();
    expect(fixtures.map((f) => f.name).sort()).toEqual([
      "admin audit list item shape",
      "evaluate key is forbidden on audit",
    ]);

    const list = fixtures.find((f) => f.name === "admin audit list item shape");
    expect(list).toBeDefined();
    expect(await responseAccepted(auditListSchema, list?.response.body)).toBe(true);
    expect(await schemaStatus(auditListQuerySchema, { limit: "50" })).toBe(200);
    expect(await schemaStatus(auditListQuerySchema, { limit: "201" })).toBe(400);

    const forbidden = fixtures.find((f) => f.name === "evaluate key is forbidden on audit");
    expect(await responseAccepted(errorEnvelopeSchema, forbidden?.response.body)).toBe(true);

    const evalKey = mintApiKey("evaluate");
    const findApiKey = (prefix: string) =>
      Promise.resolve(prefix === evalKey.prefix ? keyRecord(evalKey, "eval-key") : undefined);
    const app = buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" }, { findApiKey });
    const res = await app.inject({
      method: "GET",
      url: "/v1/audit",
      headers: { authorization: `Bearer ${evalKey.raw}` },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
    await app.close();
  });
});
