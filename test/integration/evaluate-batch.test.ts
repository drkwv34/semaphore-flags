import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import { hashBucket } from "../../src/domain/evaluate/index.js";
import { createProjectWithKeys } from "../../src/services/projects.js";
import { EVALUATE_BATCH_MAX_KEYS, type EvaluateResponse } from "../../src/services/evaluate.js";
import { withTestPool } from "./helpers.js";

function json(res: { json: () => unknown }): unknown {
  return res.json();
}

function keys(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `k_${String(i).padStart(2, "0")}`);
}

function userForBucket(salt: string, flagKey: string, bucket: number): string {
  for (let i = 0; i < 20_000; i++) {
    const id = `u${String(i)}`;
    if (hashBucket(salt, flagKey, id) === bucket) return id;
  }
  throw new Error(`no user hashed to bucket ${String(bucket)}`);
}

describe("POST /v1/evaluate-batch (FR-EVAL-003, NFR-SEC-001)", () => {
  it("covers max 50, 51 rejected, partial not_found, agreement, and authz", async () => {
    await withTestPool(async (pool) => {
      const created = await createProjectWithKeys(pool, { name: "Batch", slug: "batch-proj" });
      const app = buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" }, { pool });
      const admin = {
        authorization: `Bearer ${created.adminKey.raw}`,
        "content-type": "application/json",
      };
      const evaluate = {
        authorization: `Bearer ${created.evaluateKey.raw}`,
        "content-type": "application/json",
      };

      expect(
        (
          await app.inject({
            method: "POST",
            url: "/v1/evaluate-batch",
            headers: admin,
            payload: { env: "dev", user: { id: "u1" }, flag_keys: ["checkout_v2"] },
          })
        ).statusCode,
      ).toBe(403);

      expect(
        (
          await app.inject({
            method: "POST",
            url: "/v1/evaluate-batch",
            payload: { env: "dev", user: { id: "u1" }, flag_keys: ["checkout_v2"] },
          })
        ).statusCode,
      ).toBe(401);

      const tooMany = await app.inject({
        method: "POST",
        url: "/v1/evaluate-batch",
        headers: evaluate,
        payload: { env: "dev", user: { id: "u1" }, flag_keys: keys(EVALUATE_BATCH_MAX_KEYS + 1) },
      });
      expect(tooMany.statusCode).toBe(400);
      expect(tooMany.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });

      const fifty = await app.inject({
        method: "POST",
        url: "/v1/evaluate-batch",
        headers: evaluate,
        payload: { env: "dev", user: { id: "u1" }, flag_keys: keys(EVALUATE_BATCH_MAX_KEYS) },
      });
      expect(fifty.statusCode).toBe(200);
      expect(Object.keys(json(fifty) as Record<string, EvaluateResponse>)).toHaveLength(
        EVALUATE_BATCH_MAX_KEYS,
      );

      expect(
        (
          await app.inject({
            method: "POST",
            url: "/v1/flags",
            headers: admin,
            payload: { key: "kill_switch", default_value: false },
          })
        ).statusCode,
      ).toBe(201);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/v1/flags",
            headers: admin,
            payload: { key: "checkout_v2", default_value: false },
          })
        ).statusCode,
      ).toBe(201);
      expect(
        (
          await app.inject({
            method: "PUT",
            url: "/v1/flags/checkout_v2/envs/dev",
            headers: admin,
            payload: {
              enabled: true,
              percentage: 0,
              rules: [{ priority: 0, attribute: "user.plan", op: "eq", value: "pro", serve: true }],
            },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: "PUT",
            url: "/v1/flags/checkout_v2/envs/staging",
            headers: admin,
            payload: { enabled: true, percentage: 100, rules: [] },
          })
        ).statusCode,
      ).toBe(200);

      const partial = await app.inject({
        method: "POST",
        url: "/v1/evaluate-batch",
        headers: evaluate,
        payload: { env: "prod", user: { id: "u1" }, flag_keys: ["kill_switch", "missing_flag"] },
      });
      expect(partial.statusCode).toBe(200);
      expect(partial.json()).toEqual({
        kill_switch: {
          flag_key: "kill_switch",
          value: false,
          reason: "disabled",
          variant: "off",
        },
        missing_flag: {
          flag_key: "missing_flag",
          value: false,
          reason: "not_found",
          variant: "off",
        },
      });

      async function single(
        flagKey: string,
        env: string,
        user: { id: string; attrs?: Record<string, string> },
      ): Promise<EvaluateResponse> {
        const res = await app.inject({
          method: "POST",
          url: "/v1/evaluate",
          headers: evaluate,
          payload: { flag_key: flagKey, env, user },
        });
        expect(res.statusCode).toBe(200);
        return json(res) as EvaluateResponse;
      }

      async function batchOne(
        flagKey: string,
        env: string,
        user: { id: string; attrs?: Record<string, string> },
      ): Promise<EvaluateResponse> {
        const res = await app.inject({
          method: "POST",
          url: "/v1/evaluate-batch",
          headers: evaluate,
          payload: { env, user, flag_keys: [flagKey] },
        });
        expect(res.statusCode).toBe(200);
        const body = json(res) as Record<string, EvaluateResponse>;
        const entry = body[flagKey];
        if (entry === undefined) throw new Error(`missing batch entry for ${flagKey}`);
        return entry;
      }

      const killUser = { id: "u1" };
      expect(await batchOne("kill_switch", "prod", killUser)).toEqual(
        await single("kill_switch", "prod", killUser),
      );

      const ruleUser = { id: "u1", attrs: { plan: "pro" } };
      expect(await batchOne("checkout_v2", "dev", ruleUser)).toEqual(
        await single("checkout_v2", "dev", ruleUser),
      );

      const pct100 = { id: "anyone" };
      expect(await batchOne("checkout_v2", "staging", pct100)).toEqual(
        await single("checkout_v2", "staging", pct100),
      );

      expect(
        (
          await app.inject({
            method: "PUT",
            url: "/v1/flags/checkout_v2/envs/prod",
            headers: admin,
            payload: { enabled: true, percentage: 0, rules: [] },
          })
        ).statusCode,
      ).toBe(200);
      expect(await batchOne("checkout_v2", "prod", { id: "anyone" })).toEqual(
        await single("checkout_v2", "prod", { id: "anyone" }),
      );

      const salt = created.project.salt;
      const inUser = userForBucket(salt, "checkout_v2", 0);
      const outUser = userForBucket(salt, "checkout_v2", 99);
      expect(
        (
          await app.inject({
            method: "PUT",
            url: "/v1/flags/checkout_v2/envs/prod",
            headers: admin,
            payload: { enabled: true, percentage: 1, rules: [] },
          })
        ).statusCode,
      ).toBe(200);
      expect(await batchOne("checkout_v2", "prod", { id: inUser })).toEqual(
        await single("checkout_v2", "prod", { id: inUser }),
      );
      expect(
        (
          await app.inject({
            method: "PUT",
            url: "/v1/flags/checkout_v2/envs/prod",
            headers: admin,
            payload: { enabled: true, percentage: 99, rules: [] },
          })
        ).statusCode,
      ).toBe(200);
      expect(await batchOne("checkout_v2", "prod", { id: outUser })).toEqual(
        await single("checkout_v2", "prod", { id: outUser }),
      );

      expect(
        (
          await app.inject({
            method: "POST",
            url: "/v1/flags/checkout_v2/archive",
            headers: { authorization: admin.authorization },
          })
        ).statusCode,
      ).toBe(200);
      expect(await batchOne("checkout_v2", "dev", ruleUser)).toEqual(
        await single("checkout_v2", "dev", ruleUser),
      );

      await app.close();
    });
  });
});
