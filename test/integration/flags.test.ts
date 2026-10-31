import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import type { ErrorBody } from "../../src/api/errors.js";
import { createProjectWithKeys } from "../../src/services/projects.js";
import type { EnvConfigJson, FlagDetailJson, FlagListJson } from "../../src/services/flags.js";
import { listAuditEvents, migrate } from "../../src/store/index.js";
import { withTestPool } from "./helpers.js";

function json(res: { json: () => unknown }): unknown {
  return res.json();
}

const FLAG_ADMIN_ROUTES = [
  { method: "POST" as const, url: "/v1/flags", payload: { key: "x_flag", default_value: false } },
  { method: "GET" as const, url: "/v1/flags" },
  { method: "GET" as const, url: "/v1/flags/checkout_v2" },
  { method: "PATCH" as const, url: "/v1/flags/checkout_v2", payload: { description: "n" } },
  {
    method: "PUT" as const,
    url: "/v1/flags/checkout_v2/envs/dev",
    payload: { enabled: true, percentage: 10, rules: [] },
  },
  { method: "POST" as const, url: "/v1/flags/checkout_v2/archive" },
];

describe("flags admin API (FR-FLAG-001..004, FR-RULE-004, FR-AUD-001/002/004)", () => {
  it("covers create, list, get, put, archive, errors, 403, and audit", async () => {
    await withTestPool(async (pool) => {
      const applied = await migrate(pool);
      expect(applied.applied).toEqual([]);

      const created = await createProjectWithKeys(pool, { name: "Flags", slug: "flags-proj" });
      const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" }, { pool });
      const adminAuth = { authorization: `Bearer ${created.adminKey.raw}` };
      const admin = { ...adminAuth, "content-type": "application/json" };
      const evaluateAuth = { authorization: `Bearer ${created.evaluateKey.raw}` };

      for (const route of FLAG_ADMIN_ROUTES) {
        const res = await app.inject({
          method: route.method,
          url: route.url,
          headers:
            route.payload !== undefined
              ? { ...evaluateAuth, "content-type": "application/json" }
              : evaluateAuth,
          ...(route.payload !== undefined ? { payload: route.payload } : {}),
        });
        expect(res.statusCode, `${route.method} ${route.url}`).toBe(403);
        expect(res.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
      }

      const posted = await app.inject({
        method: "POST",
        url: "/v1/flags",
        headers: admin,
        payload: { key: "checkout_v2", description: "Checkout", default_value: false },
      });
      expect(posted.statusCode).toBe(201);
      const createdFlag = json(posted) as FlagDetailJson;
      expect(createdFlag).toMatchObject({
        key: "checkout_v2",
        flag_type: "boolean",
        default_value: false,
        client_fallback: "fail_closed",
        archived_at: null,
      });
      expect(createdFlag.envs.map((e) => e.key)).toEqual(["dev", "prod", "staging"]);
      expect(
        createdFlag.envs.every((e) => !e.enabled && e.percentage === 0 && e.rules.length === 0),
      ).toBe(true);

      const listed = await app.inject({ method: "GET", url: "/v1/flags", headers: admin });
      expect(listed.statusCode).toBe(200);
      const listedBody = json(listed) as FlagListJson;
      expect(listedBody.items).toHaveLength(1);
      expect(listedBody.items[0]?.key).toBe("checkout_v2");
      expect(listedBody.items[0] !== undefined && "envs" in listedBody.items[0]).toBe(false);

      const got = await app.inject({
        method: "GET",
        url: "/v1/flags/checkout_v2",
        headers: admin,
      });
      expect(got.statusCode).toBe(200);
      expect((json(got) as FlagDetailJson).envs).toHaveLength(3);

      const duplicate = await app.inject({
        method: "POST",
        url: "/v1/flags",
        headers: admin,
        payload: { key: "checkout_v2", default_value: true },
      });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json()).toMatchObject({ error: { code: "CONFLICT" } });

      const invalidKey = await app.inject({
        method: "POST",
        url: "/v1/flags",
        headers: admin,
        payload: { key: "NOPE", default_value: false },
      });
      expect(invalidKey.statusCode).toBe(400);

      const invalidRule = await app.inject({
        method: "PUT",
        url: "/v1/flags/checkout_v2/envs/dev",
        headers: admin,
        payload: {
          enabled: true,
          percentage: 50,
          rules: [{ priority: 0, attribute: "", op: "gt", value: "5", serve: true }],
        },
      });
      expect(invalidRule.statusCode).toBe(400);
      const invalidBody = json(invalidRule) as ErrorBody;
      expect(invalidBody).toMatchObject({ error: { code: "VALIDATION_FAILED" } });
      expect(invalidBody.error.fields?.length).toBeGreaterThan(0);
      expect(invalidBody.error.fields?.some((f) => f.path.includes("/rules/0"))).toBe(true);

      const afterInvalid = await app.inject({
        method: "GET",
        url: "/v1/flags/checkout_v2",
        headers: admin,
      });
      const devBefore = (json(afterInvalid) as FlagDetailJson).envs.find((e) => e.key === "dev");
      expect(devBefore?.enabled).toBe(false);
      expect(devBefore?.rules).toEqual([]);

      const put = await app.inject({
        method: "PUT",
        url: "/v1/flags/checkout_v2/envs/dev",
        headers: admin,
        payload: {
          enabled: true,
          percentage: 50,
          rules: [
            {
              priority: 10,
              attribute: "user.country",
              op: "eq",
              value: "US",
              serve: false,
            },
            { priority: 0, attribute: "user.plan", op: "eq", value: "pro", serve: true },
          ],
        },
      });
      expect(put.statusCode).toBe(200);
      const putBody = json(put) as EnvConfigJson;
      expect(putBody).toMatchObject({ key: "dev", enabled: true, percentage: 50 });
      expect(putBody.rules.map((r) => r.priority)).toEqual([0, 10]);

      const gotAfterPut = await app.inject({
        method: "GET",
        url: "/v1/flags/checkout_v2",
        headers: admin,
      });
      const dev = (json(gotAfterPut) as FlagDetailJson).envs.find((e) => e.key === "dev");
      expect(dev?.rules.map((r) => r.priority)).toEqual([0, 10]);
      const keepId = dev?.rules[0]?.id;
      const dropId = dev?.rules[1]?.id;
      expect(keepId).toBeDefined();
      expect(dropId).toBeDefined();

      const putDiff = await app.inject({
        method: "PUT",
        url: "/v1/flags/checkout_v2/envs/dev",
        headers: admin,
        payload: {
          enabled: true,
          percentage: 50,
          rules: [
            {
              id: keepId,
              priority: 0,
              attribute: "user.plan",
              op: "eq",
              value: "enterprise",
              serve: true,
            },
            {
              priority: 5,
              attribute: "user.beta",
              op: "eq",
              value: true,
              serve: true,
            },
          ],
        },
      });
      expect(putDiff.statusCode).toBe(200);
      const diffBody = json(putDiff) as EnvConfigJson;
      expect(diffBody.rules).toHaveLength(2);
      expect(diffBody.rules.find((r) => r.id === keepId)?.value).toBe("enterprise");
      expect(diffBody.rules.some((r) => r.id === dropId)).toBe(false);

      const unknownEnv = await app.inject({
        method: "PUT",
        url: "/v1/flags/checkout_v2/envs/nope",
        headers: admin,
        payload: { enabled: true, percentage: 1, rules: [] },
      });
      expect(unknownEnv.statusCode).toBe(404);

      const unknownFlag = await app.inject({
        method: "GET",
        url: "/v1/flags/missing_flag",
        headers: admin,
      });
      expect(unknownFlag.statusCode).toBe(404);

      const patched = await app.inject({
        method: "PATCH",
        url: "/v1/flags/checkout_v2",
        headers: admin,
        payload: { description: "Checkout v2", default_value: true },
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json()).toMatchObject({ description: "Checkout v2", default_value: true });

      const archived = await app.inject({
        method: "POST",
        url: "/v1/flags/checkout_v2/archive",
        headers: adminAuth,
      });
      expect(archived.statusCode).toBe(200);
      expect((json(archived) as FlagDetailJson).archived_at).toEqual(expect.any(String));

      const listedLive = await app.inject({ method: "GET", url: "/v1/flags", headers: admin });
      expect((json(listedLive) as FlagListJson).items).toHaveLength(0);

      const listedAll = await app.inject({
        method: "GET",
        url: "/v1/flags?include_archived=true",
        headers: admin,
      });
      expect((json(listedAll) as FlagListJson).items).toHaveLength(1);

      const readArchived = await app.inject({
        method: "GET",
        url: "/v1/flags/checkout_v2",
        headers: admin,
      });
      expect(readArchived.statusCode).toBe(200);

      const patchArchived = await app.inject({
        method: "PATCH",
        url: "/v1/flags/checkout_v2",
        headers: admin,
        payload: { description: "nope" },
      });
      expect(patchArchived.statusCode).toBe(409);

      const putArchived = await app.inject({
        method: "PUT",
        url: "/v1/flags/checkout_v2/envs/dev",
        headers: admin,
        payload: { enabled: false, percentage: 0, rules: [] },
      });
      expect(putArchived.statusCode).toBe(409);

      const archiveAgain = await app.inject({
        method: "POST",
        url: "/v1/flags/checkout_v2/archive",
        headers: adminAuth,
      });
      expect(archiveAgain.statusCode).toBe(409);

      const other = await app.inject({
        method: "POST",
        url: "/v1/flags",
        headers: admin,
        payload: { key: "beta_ui", default_value: false },
      });
      expect(other.statusCode).toBe(201);
      const page = await app.inject({
        method: "GET",
        url: "/v1/flags?limit=1&offset=0",
        headers: admin,
      });
      const pageBody = json(page) as FlagListJson;
      expect(pageBody.items).toHaveLength(1);
      expect(pageBody.limit).toBe(1);
      expect(pageBody.offset).toBe(0);

      const events = await listAuditEvents(pool, created.project.id);
      const actions = events.map((e) => e.action);
      expect(actions.filter((a) => a === "flag.create")).toHaveLength(2);
      expect(actions).toContain("flag.update");
      expect(actions).toContain("flag.archive");
      expect(actions).toContain("env_config.update");
      expect(actions).toContain("rule.create");
      expect(actions).toContain("rule.update");
      expect(actions).toContain("rule.delete");
      const adminRow = await pool.query<{ id: string }>(
        "SELECT id FROM api_keys WHERE prefix = $1",
        [created.adminKey.prefix],
      );
      expect(events.every((e) => e.actorKeyId === adminRow.rows[0]?.id)).toBe(true);
      expect(events.every((e) => e.requestId.length > 0)).toBe(true);
      expect(JSON.stringify(events)).not.toContain(created.adminKey.raw);
      expect(JSON.stringify(events)).not.toContain("key_hash");

      await expect(pool.query("UPDATE audit_events SET action = 'x'")).rejects.toThrow(
        /append-only/,
      );
      await expect(pool.query("DELETE FROM audit_events")).rejects.toThrow(/append-only/);
      const stillThere = await listAuditEvents(pool, created.project.id);
      expect(stillThere.length).toBe(events.length);

      await app.close();
    });
  });
});
