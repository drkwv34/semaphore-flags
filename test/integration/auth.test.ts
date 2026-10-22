import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import { createProjectWithKeys } from "../../src/services/projects.js";
import { mintApiKey } from "../../src/services/api-keys.js";
import { insertApiKey, revokeApiKey } from "../../src/store/index.js";
import { withTestPool } from "./helpers.js";

const unknownRaw = "sf_admin_ffffffff_" + "11".repeat(32);

describe("auth 401/403 matrix (FR-PROJ-002, NFR-SEC-001)", () => {
  it("covers missing, malformed, unknown, revoked, and wrong-type keys on existing routes", async () => {
    await withTestPool(async (pool) => {
      const created = await createProjectWithKeys(pool, { name: "Auth", slug: "auth-proj" });
      const extra = mintApiKey("admin");
      const extraRow = await insertApiKey(pool, {
        projectId: created.project.id,
        type: extra.type,
        prefix: extra.prefix,
        keyHash: extra.keyHash,
      });
      await revokeApiKey(pool, extraRow.id);

      const app = buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" }, { pool });
      const bearer = (raw: string) => ({ authorization: `Bearer ${raw}` });

      const missing = await app.inject({ method: "GET", url: "/v1/projects/current" });
      expect(missing.statusCode).toBe(401);
      expect(missing.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });

      const malformed = await app.inject({
        method: "GET",
        url: "/v1/projects/current",
        headers: { authorization: "NotBearer abc" },
      });
      expect(malformed.statusCode).toBe(401);

      const unknown = await app.inject({
        method: "GET",
        url: "/v1/projects/current",
        headers: bearer(unknownRaw),
      });
      expect(unknown.statusCode).toBe(401);

      const revoked = await app.inject({
        method: "GET",
        url: "/v1/projects/current",
        headers: bearer(extra.raw),
      });
      expect(revoked.statusCode).toBe(401);

      const evalOnAdmin = await app.inject({
        method: "GET",
        url: "/v1/projects/current",
        headers: bearer(created.evaluateKey.raw),
      });
      expect(evalOnAdmin.statusCode).toBe(403);
      expect(evalOnAdmin.json()).toMatchObject({ error: { code: "FORBIDDEN" } });

      const adminOk = await app.inject({
        method: "GET",
        url: "/v1/projects/current",
        headers: bearer(created.adminKey.raw),
      });
      expect(adminOk.statusCode).toBe(200);
      expect(adminOk.json()).toMatchObject({
        id: created.project.id,
        name: "Auth",
        slug: "auth-proj",
      });

      const adminOnEval = await app.inject({
        method: "POST",
        url: "/v1/evaluate",
        headers: bearer(created.adminKey.raw),
      });
      expect(adminOnEval.statusCode).toBe(403);

      const evalOk = await app.inject({
        method: "POST",
        url: "/v1/evaluate",
        headers: bearer(created.evaluateKey.raw),
      });
      expect(evalOk.statusCode).toBe(501);
      expect(evalOk.json()).toMatchObject({ error: { code: "NOT_IMPLEMENTED" } });

      const evalMissing = await app.inject({ method: "POST", url: "/v1/evaluate" });
      expect(evalMissing.statusCode).toBe(401);

      await app.close();
    });
  });

  it("leaves GET /v1/__probe as 404 even with a valid admin key", async () => {
    await withTestPool(async (pool) => {
      const created = await createProjectWithKeys(pool, { name: "Probe", slug: "probe-proj" });
      const app = buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" }, { pool });

      const unauth = await app.inject({ method: "GET", url: "/v1/__probe" });
      expect(unauth.statusCode).toBe(404);

      const authed = await app.inject({
        method: "GET",
        url: "/v1/__probe",
        headers: { authorization: `Bearer ${created.adminKey.raw}` },
      });
      expect(authed.statusCode).toBe(404);
      await app.close();
    });
  });
});

describe("POST /v1/environments", () => {
  it("creates a custom env, rejects invalid keys, and conflicts on duplicates", async () => {
    await withTestPool(async (pool) => {
      const created = await createProjectWithKeys(pool, { name: "Envs", slug: "envs-proj" });
      const app = buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" }, { pool });
      const headers = {
        authorization: `Bearer ${created.adminKey.raw}`,
        "content-type": "application/json",
      };

      const createdEnv = await app.inject({
        method: "POST",
        url: "/v1/environments",
        headers,
        payload: { key: "qa" },
      });
      expect(createdEnv.statusCode).toBe(201);
      expect(createdEnv.json()).toMatchObject({ key: "qa" });

      const invalid = await app.inject({
        method: "POST",
        url: "/v1/environments",
        headers,
        payload: { key: "NOPE" },
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toMatchObject({ error: { code: "VALIDATION_FAILED" } });

      const duplicate = await app.inject({
        method: "POST",
        url: "/v1/environments",
        headers,
        payload: { key: "dev" },
      });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json()).toMatchObject({ error: { code: "CONFLICT" } });

      await app.close();
    });
  });
});
