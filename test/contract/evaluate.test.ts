import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import { evaluateBodySchema, evaluateResponseSchema } from "../../src/api/evaluate-schemas.js";
import { errorEnvelopeSchema } from "../../src/api/schemas.js";
import {
  compileSnapshot,
  evaluate,
  parseEvalUser,
  type CompiledRule,
  type SnapshotSource,
} from "../../src/domain/evaluate/index.js";
import type { RuleOp } from "../../src/domain/rules/index.js";
import { mintApiKey } from "../../src/services/api-keys.js";
import type { ApiKeyRecord } from "../../src/store/index.js";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../contracts/evaluate",
);

interface SetupFlag {
  key: string;
  archived: boolean;
  default_value: boolean;
  enabled: boolean;
  percentage: number;
  rules: readonly {
    attribute: string;
    op: RuleOp;
    value: unknown;
    serve: boolean;
  }[];
}

interface Fixture {
  name: string;
  auth: "evaluate" | "admin" | "none";
  setup: { salt: string; env: string; flags: readonly SetupFlag[] };
  request: { method: string; url: string; body?: unknown };
  response: { status: number; body: Record<string, unknown> };
}

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function json(res: { json: () => unknown }): unknown {
  return res.json();
}

async function loadFixtures(): Promise<Fixture[]> {
  const files = (await readdir(fixturesDir))
    .filter((name) => name.endsWith(".json") && name !== "bucket-vectors.json")
    .sort();
  const fixtures: Fixture[] = [];
  for (const file of files) {
    const raw = await readFile(path.join(fixturesDir, file), "utf8");
    fixtures.push(JSON.parse(raw) as Fixture);
  }
  return fixtures;
}

function snapshotFromSetup(setup: Fixture["setup"]) {
  return compileSnapshot({
    projectId: PROJECT_ID,
    env: setup.env,
    salt: setup.salt,
    flags: setup.flags.map((flag) => ({
      key: flag.key,
      archived: flag.archived,
      defaultValue: flag.default_value,
      enabled: flag.enabled,
      percentage: flag.percentage,
      rules: flag.rules.map((rule): CompiledRule => ({
        attribute: rule.attribute,
        op: rule.op,
        value: rule.value as CompiledRule["value"],
        serve: rule.serve,
      })),
    })),
  });
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

describe("evaluate contract fixtures (FR-EVAL-001/002/004)", () => {
  it("agree with the unit algorithm and inject to the same HTTP bodies", async () => {
    const fixtures = await loadFixtures();
    expect(fixtures.map((f) => f.name).sort()).toEqual([
      "admin key is forbidden on evaluate",
      "archived flag is false",
      "bucket 0 is in at percentage 1",
      "bucket 99 is out at percentage 99",
      "first matching rule wins",
      "kill switch disabled in prod",
      "missing attribute does not match",
      "missing flag is not_found",
      "missing key is unauthorized",
      "percentage 0 is everyone out after rules",
    ]);

    const evalKey = mintApiKey("evaluate");
    const adminKey = mintApiKey("admin");
    const findApiKey = (prefix: string) => {
      if (prefix === evalKey.prefix) return Promise.resolve(keyRecord(evalKey, "eval-key"));
      if (prefix === adminKey.prefix) return Promise.resolve(keyRecord(adminKey, "admin-key"));
      return Promise.resolve(undefined);
    };

    for (const fixture of fixtures) {
      const compiled = snapshotFromSetup(fixture.setup);
      const source: SnapshotSource = {
        get(projectId, env) {
          if (projectId !== PROJECT_ID || env !== compiled.env) return Promise.resolve(undefined);
          return Promise.resolve(compiled);
        },
      };

      if (fixture.response.status === 200) {
        const body = fixture.request.body as {
          flag_key: string;
          env: string;
          user: { id?: unknown; attrs?: unknown };
        };
        const user = parseEvalUser(body.user);
        const result = evaluate(compiled.flags.get(body.flag_key), user, compiled.salt);
        expect(
          {
            flag_key: body.flag_key,
            value: result.value,
            reason: result.reason,
            variant: result.variant,
          },
          fixture.name,
        ).toEqual(fixture.response.body);
        expect(await schemaStatus(evaluateBodySchema, fixture.request.body)).toBe(200);
        expect(await responseAccepted(evaluateResponseSchema, fixture.response.body)).toBe(true);
      } else {
        expect(await responseAccepted(errorEnvelopeSchema, fixture.response.body)).toBe(true);
      }

      const app = buildApp(
        { NODE_ENV: "test", LOG_LEVEL: "info" },
        { findApiKey, snapshotSource: source },
      );
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (fixture.auth === "evaluate") headers.authorization = `Bearer ${evalKey.raw}`;
      if (fixture.auth === "admin") headers.authorization = `Bearer ${adminKey.raw}`;

      const res = await app.inject({
        method: "POST",
        url: fixture.request.url,
        headers,
        payload: fixture.request.body as object,
      });
      expect(res.statusCode, fixture.name).toBe(fixture.response.status);
      const payload = json(res);
      if (fixture.response.status === 200) {
        expect(payload, fixture.name).toEqual(fixture.response.body);
      } else {
        const json = payload as { error: { code: string } };
        const expected = fixture.response.body as { error: { code: string } };
        expect(json.error.code, fixture.name).toBe(expected.error.code);
      }
      await app.close();
    }
  });

  it("returns 503 when the snapshot source fails", async () => {
    const evalKey = mintApiKey("evaluate");
    const findApiKey = (prefix: string) =>
      Promise.resolve(prefix === evalKey.prefix ? keyRecord(evalKey, "eval-key") : undefined);
    const snapshotSource: SnapshotSource = {
      get() {
        return Promise.reject(new Error("ECONNREFUSED"));
      },
    };
    const app = buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" }, { findApiKey, snapshotSource });
    const res = await app.inject({
      method: "POST",
      url: "/v1/evaluate",
      headers: {
        authorization: `Bearer ${evalKey.raw}`,
        "content-type": "application/json",
      },
      payload: { flag_key: "checkout_v2", env: "prod", user: { id: "u1" } },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: { code: "UNAVAILABLE" } });
    await app.close();
  });
});
