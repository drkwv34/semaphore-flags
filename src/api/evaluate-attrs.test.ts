import { describe, expect, it } from "vitest";

import { compileSnapshot, type SnapshotSource } from "../domain/evaluate/index.js";
import { mintApiKey } from "../services/api-keys.js";
import type { ApiKeyRecord } from "../store/index.js";
import { buildApp } from "./app.js";
import { evaluateBodySchema, evaluateBatchBodySchema } from "./evaluate-schemas.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function keyRecord(
  minted: ReturnType<typeof mintApiKey>,
  id: string,
  type: ApiKeyRecord["type"] = minted.type,
): ApiKeyRecord {
  return {
    id,
    projectId: PROJECT_ID,
    type,
    prefix: minted.prefix,
    keyHash: minted.keyHash,
    createdAt: new Date(0),
    revokedAt: null,
  };
}

function snapshotSource(flags: Parameters<typeof compileSnapshot>[0]["flags"]): SnapshotSource {
  const snapshot = compileSnapshot({
    projectId: PROJECT_ID,
    env: "prod",
    salt: "fixture-salt",
    flags,
  });
  return {
    get(projectId, env) {
      if (projectId !== PROJECT_ID || env !== "prod") return Promise.resolve(undefined);
      return Promise.resolve(snapshot);
    },
  };
}

function attrAnyOfTypes(schema: unknown): Set<string> {
  const types = new Set<string>();
  const root = schema as {
    properties?: {
      user?: { properties?: { attrs?: { additionalProperties?: { anyOf?: unknown } } } };
    };
  };
  const anyOf = root.properties?.user?.properties?.attrs?.additionalProperties?.anyOf;
  if (!Array.isArray(anyOf)) return types;
  for (const entry of anyOf) {
    if (typeof entry !== "object" || entry === null) continue;
    const item = entry as { type?: unknown; nullable?: unknown; enum?: unknown };
    if (item.type === "string" || item.type === "number" || item.type === "boolean") {
      types.add(item.type);
    }
    if (
      item.type === "null" ||
      item.nullable === true ||
      (Array.isArray(item.enum) && item.enum[0] === null)
    ) {
      types.add("null");
    }
  }
  return types;
}

describe("evaluate user.attrs JSON types (FR-EVAL-001, FR-RULE-003)", () => {
  it("matches numeric and boolean attrs from the HTTP body on evaluate and batch", async () => {
    const evalKey = mintApiKey("evaluate");
    const findApiKey = (prefix: string) =>
      Promise.resolve(prefix === evalKey.prefix ? keyRecord(evalKey, "eval-key") : undefined);
    const snapshotSourceTyped = snapshotSource([
      {
        key: "age_gate",
        archived: false,
        defaultValue: false,
        enabled: true,
        percentage: 0,
        rules: [{ attribute: "user.age", op: "gte", value: 18, serve: true }],
      },
      {
        key: "age_eq",
        archived: false,
        defaultValue: false,
        enabled: true,
        percentage: 0,
        rules: [
          { attribute: "user.age", op: "eq", value: 18, serve: true },
          { attribute: "user.age", op: "eq", value: "18", serve: false },
        ],
      },
      {
        key: "beta_flag",
        archived: false,
        defaultValue: false,
        enabled: true,
        percentage: 0,
        rules: [
          { attribute: "user.beta", op: "eq", value: true, serve: true },
          { attribute: "user.beta", op: "eq", value: "true", serve: false },
        ],
      },
      {
        key: "age_gt",
        archived: false,
        defaultValue: false,
        enabled: true,
        percentage: 0,
        rules: [{ attribute: "user.age", op: "gt", value: 17, serve: true }],
      },
      {
        key: "age_lt",
        archived: false,
        defaultValue: false,
        enabled: true,
        percentage: 0,
        rules: [{ attribute: "user.age", op: "lt", value: 19, serve: true }],
      },
      {
        key: "age_in",
        archived: false,
        defaultValue: false,
        enabled: true,
        percentage: 0,
        rules: [{ attribute: "user.age", op: "in", value: [18, 21], serve: true }],
      },
    ]);

    const app = await buildApp(
      { NODE_ENV: "test", LOG_LEVEL: "info" },
      { findApiKey, snapshotSource: snapshotSourceTyped },
    );
    const headers = {
      authorization: `Bearer ${evalKey.raw}`,
      "content-type": "application/json",
    };

    async function evaluate(
      flagKey: string,
      attrs: Record<string, string | number | boolean | null>,
    ): Promise<{ value: boolean; reason: string }> {
      const res = await app.inject({
        method: "POST",
        url: "/v1/evaluate",
        headers,
        payload: { flag_key: flagKey, env: "prod", user: { id: "u1", attrs } },
      });
      expect(res.statusCode).toBe(200);
      return res.json();
    }

    async function batch(
      flagKey: string,
      attrs: Record<string, string | number | boolean | null>,
    ): Promise<{ value: boolean; reason: string }> {
      const res = await app.inject({
        method: "POST",
        url: "/v1/evaluate-batch",
        headers,
        payload: { env: "prod", user: { id: "u1", attrs }, flag_keys: [flagKey] },
      });
      expect(res.statusCode).toBe(200);
      const body: Record<string, { value: boolean; reason: string }> = res.json();
      const entry = body[flagKey];
      if (entry === undefined) throw new Error(`missing batch entry for ${flagKey}`);
      return entry;
    }

    const gte = await evaluate("age_gate", { age: 18 });
    expect(gte).toMatchObject({ value: true, reason: "rule_match" });
    expect(await batch("age_gate", { age: 18 })).toEqual(gte);

    const eqNumber = await evaluate("age_eq", { age: 18 });
    expect(eqNumber).toMatchObject({ value: true, reason: "rule_match" });
    expect(await batch("age_eq", { age: 18 })).toEqual(eqNumber);

    const eqBool = await evaluate("beta_flag", { beta: true });
    expect(eqBool).toMatchObject({ value: true, reason: "rule_match" });
    expect(await batch("beta_flag", { beta: true })).toEqual(eqBool);

    const gt = await evaluate("age_gt", { age: 18 });
    expect(gt).toMatchObject({ value: true, reason: "rule_match" });
    const lt = await evaluate("age_lt", { age: 18 });
    expect(lt).toMatchObject({ value: true, reason: "rule_match" });
    const inn = await evaluate("age_in", { age: 18 });
    expect(inn).toMatchObject({ value: true, reason: "rule_match" });
    expect(await batch("age_gt", { age: 18 })).toEqual(gt);
    expect(await batch("age_lt", { age: 18 })).toEqual(lt);
    expect(await batch("age_in", { age: 18 })).toEqual(inn);

    await app.close();
  });

  it("keeps OpenAPI attr additionalProperties as string, number, boolean, or null", async () => {
    const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" });
    await app.ready();
    const doc = app.swagger() as {
      paths?: Record<
        string,
        Record<string, { requestBody?: { content?: Record<string, { schema?: unknown }> } }>
      >;
    };
    const evaluateSchema =
      doc.paths?.["/v1/evaluate"]?.post?.requestBody?.content?.["application/json"]?.schema;
    const batchSchema =
      doc.paths?.["/v1/evaluate-batch"]?.post?.requestBody?.content?.["application/json"]?.schema;
    const expected = new Set(["string", "number", "boolean", "null"]);
    expect(attrAnyOfTypes(evaluateSchema ?? evaluateBodySchema)).toEqual(expected);
    expect(attrAnyOfTypes(batchSchema ?? evaluateBatchBodySchema)).toEqual(expected);
    expect(attrAnyOfTypes(evaluateBodySchema)).toEqual(expected);
    expect(attrAnyOfTypes(evaluateBatchBodySchema)).toEqual(expected);
    await app.close();
  });

  it("still coerces audit limit from the query string", async () => {
    const adminKey = mintApiKey("admin");
    const findApiKey = (prefix: string) =>
      Promise.resolve(prefix === adminKey.prefix ? keyRecord(adminKey, "admin-key") : undefined);
    const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" }, { findApiKey });
    const res = await app.inject({
      method: "GET",
      url: "/v1/audit?limit=50",
      headers: { authorization: `Bearer ${adminKey.raw}` },
    });
    expect(res.statusCode).not.toBe(400);
    expect(res.statusCode).toBe(503);
    await app.close();
  });
});
