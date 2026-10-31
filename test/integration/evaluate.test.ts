import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import { loadEnvSnapshot } from "../../src/store/index.js";
import { createProjectWithKeys } from "../../src/services/projects.js";
import { withTestPool } from "./helpers.js";

describe("POST /v1/evaluate (FR-EVAL-001/002, FR-ERR-001, NFR-SEC-001)", () => {
  it("covers every reason, kill switch, 403, 401, and 400 against Postgres", async () => {
    await withTestPool(async (pool) => {
      const created = await createProjectWithKeys(pool, { name: "Eval", slug: "eval-proj" });
      const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" }, { pool });
      const admin = {
        authorization: `Bearer ${created.adminKey.raw}`,
        "content-type": "application/json",
      };
      const evaluate = {
        authorization: `Bearer ${created.evaluateKey.raw}`,
        "content-type": "application/json",
      };

      const snapshot = await loadEnvSnapshot(pool, created.project.id, "dev");
      expect(snapshot?.salt).toBe(created.project.salt);
      expect(snapshot?.flags.size).toBe(0);

      const forbidden = await app.inject({
        method: "POST",
        url: "/v1/evaluate",
        headers: admin,
        payload: { flag_key: "checkout_v2", env: "dev", user: { id: "u1" } },
      });
      expect(forbidden.statusCode).toBe(403);

      const missingKey = await app.inject({
        method: "POST",
        url: "/v1/evaluate",
        payload: { flag_key: "checkout_v2", env: "dev", user: { id: "u1" } },
      });
      expect(missingKey.statusCode).toBe(401);

      const malformed = await app.inject({
        method: "POST",
        url: "/v1/evaluate",
        headers: evaluate,
        payload: { flag_key: "checkout_v2" },
      });
      expect(malformed.statusCode).toBe(400);

      const notFound = await app.inject({
        method: "POST",
        url: "/v1/evaluate",
        headers: evaluate,
        payload: { flag_key: "missing_flag", env: "dev", user: { id: "u1" } },
      });
      expect(notFound.statusCode).toBe(200);
      expect(notFound.json()).toEqual({
        flag_key: "missing_flag",
        value: false,
        reason: "not_found",
        variant: "off",
      });

      const invalidEnv = await app.inject({
        method: "POST",
        url: "/v1/evaluate",
        headers: evaluate,
        payload: { flag_key: "checkout_v2", env: "NOPE", user: { id: "u1" } },
      });
      expect(invalidEnv.statusCode).toBe(400);

      const unknownEnv = await app.inject({
        method: "POST",
        url: "/v1/evaluate",
        headers: evaluate,
        payload: { flag_key: "checkout_v2", env: "ghost", user: { id: "u1" } },
      });
      expect(unknownEnv.statusCode).toBe(200);
      expect(unknownEnv.json()).toMatchObject({ reason: "not_found", value: false });

      const createKill = await app.inject({
        method: "POST",
        url: "/v1/flags",
        headers: admin,
        payload: { key: "kill_switch", default_value: false },
      });
      expect(createKill.statusCode).toBe(201);

      const kill = await app.inject({
        method: "POST",
        url: "/v1/evaluate",
        headers: evaluate,
        payload: { flag_key: "kill_switch", env: "prod", user: { id: "u1" } },
      });
      expect(kill.statusCode).toBe(200);
      expect(kill.json()).toEqual({
        flag_key: "kill_switch",
        value: false,
        reason: "disabled",
        variant: "off",
      });

      const createCheckout = await app.inject({
        method: "POST",
        url: "/v1/flags",
        headers: admin,
        payload: { key: "checkout_v2", default_value: false },
      });
      expect(createCheckout.statusCode).toBe(201);

      const putDev = await app.inject({
        method: "PUT",
        url: "/v1/flags/checkout_v2/envs/dev",
        headers: admin,
        payload: {
          enabled: true,
          percentage: 0,
          rules: [{ priority: 0, attribute: "user.plan", op: "eq", value: "pro", serve: true }],
        },
      });
      expect(putDev.statusCode).toBe(200);

      const ruleMatch = await app.inject({
        method: "POST",
        url: "/v1/evaluate",
        headers: evaluate,
        payload: {
          flag_key: "checkout_v2",
          env: "dev",
          user: { id: "u1", attrs: { plan: "pro" } },
        },
      });
      expect(ruleMatch.statusCode).toBe(200);
      expect(ruleMatch.json()).toEqual({
        flag_key: "checkout_v2",
        value: true,
        reason: "rule_match",
        variant: "on",
      });

      const putPctIn = await app.inject({
        method: "PUT",
        url: "/v1/flags/checkout_v2/envs/staging",
        headers: admin,
        payload: { enabled: true, percentage: 100, rules: [] },
      });
      expect(putPctIn.statusCode).toBe(200);

      const percentageIn = await app.inject({
        method: "POST",
        url: "/v1/evaluate",
        headers: evaluate,
        payload: { flag_key: "checkout_v2", env: "staging", user: { id: "anyone" } },
      });
      expect(percentageIn.json()).toEqual({
        flag_key: "checkout_v2",
        value: true,
        reason: "percentage_in",
        variant: "on",
      });

      const putPctOut = await app.inject({
        method: "PUT",
        url: "/v1/flags/checkout_v2/envs/prod",
        headers: admin,
        payload: { enabled: true, percentage: 0, rules: [] },
      });
      expect(putPctOut.statusCode).toBe(200);

      const percentageOut = await app.inject({
        method: "POST",
        url: "/v1/evaluate",
        headers: evaluate,
        payload: { flag_key: "checkout_v2", env: "prod", user: { id: "anyone" } },
      });
      expect(percentageOut.json()).toEqual({
        flag_key: "checkout_v2",
        value: false,
        reason: "percentage_out",
        variant: "off",
      });

      const archived = await app.inject({
        method: "POST",
        url: "/v1/flags/checkout_v2/archive",
        headers: { authorization: admin.authorization },
      });
      expect(archived.statusCode).toBe(200);

      const archivedEval = await app.inject({
        method: "POST",
        url: "/v1/evaluate",
        headers: evaluate,
        payload: {
          flag_key: "checkout_v2",
          env: "dev",
          user: { id: "u1", attrs: { plan: "pro" } },
        },
      });
      expect(archivedEval.json()).toEqual({
        flag_key: "checkout_v2",
        value: false,
        reason: "archived",
        variant: "off",
      });

      await app.close();
    });
  });
});
