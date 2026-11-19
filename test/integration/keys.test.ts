import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import type { AuditListJson } from "../../src/services/audit.js";
import {
  listProjectApiKeys,
  revokeProjectApiKey,
  type KeyListJson,
  type KeyMetadataJson,
} from "../../src/services/api-keys.js";
import { createProjectWithKeys, seedDemoProject } from "../../src/services/projects.js";
import { listAuditEvents, listApiKeysByProject, revokeApiKey } from "../../src/store/index.js";
import { withTestPool } from "./helpers.js";

function json(res: { json: () => unknown }): unknown {
  return res.json();
}

async function installFailingKeyAudit(pool: {
  query: (sql: string) => Promise<unknown>;
}): Promise<void> {
  await pool.query(`
    CREATE FUNCTION fail_key_audit()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.action LIKE 'key.%' THEN
        RAISE EXCEPTION 'injected audit failure';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER fail_key_audit
      BEFORE INSERT ON audit_events
      FOR EACH ROW
      EXECUTE FUNCTION fail_key_audit();
  `);
}

describe("API key lifecycle (FR-PROJ-002, FR-AUD-001..004, NFR-SEC-001)", () => {
  it("audits mint on create and seed, including replenishment, without duplicating on re-seed", async () => {
    await withTestPool(async (pool) => {
      const created = await createProjectWithKeys(pool, { name: "Mint A", slug: "mint-a" });
      const events = await listAuditEvents(pool, created.project.id);
      const creates = events.filter((e) => e.action === "key.create");
      expect(creates).toHaveLength(2);
      expect(creates.every((e) => e.entityType === "key")).toBe(true);
      expect(creates.every((e) => e.actorKeyId === null)).toBe(true);
      expect(creates.every((e) => e.requestId.startsWith("cli:projects-create:"))).toBe(true);
      expect(new Set(creates.map((e) => e.entityId)).size).toBe(2);
      expect(JSON.stringify(creates)).not.toContain(created.adminKey.raw);
      expect(JSON.stringify(creates)).not.toContain(created.evaluateKey.raw);
      expect(JSON.stringify(creates)).not.toContain("key_hash");
      expect(JSON.stringify(creates)).not.toContain(created.adminKey.keyHash);

      const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" }, { pool });
      const admin = { authorization: `Bearer ${created.adminKey.raw}` };
      const byCreate = await app.inject({
        method: "GET",
        url: "/v1/audit?action=key.create",
        headers: admin,
      });
      expect(byCreate.statusCode).toBe(200);
      const createBody = json(byCreate) as AuditListJson;
      expect(createBody.items).toHaveLength(2);
      expect(createBody.items.every((item) => item.action === "key.create")).toBe(true);
      const byRevoke = await app.inject({
        method: "GET",
        url: "/v1/audit?action=key.revoke",
        headers: admin,
      });
      expect(byRevoke.statusCode).toBe(200);
      expect((json(byRevoke) as AuditListJson).items).toHaveLength(0);
      await app.close();

      const firstSeed = await seedDemoProject(pool);
      expect(firstSeed.adminKey).toBeDefined();
      const demoEvents = await listAuditEvents(pool, firstSeed.project.id);
      expect(demoEvents.filter((e) => e.action === "key.create")).toHaveLength(2);
      expect(
        demoEvents
          .filter((e) => e.action === "key.create")
          .every((e) => e.requestId.startsWith("cli:seed:")),
      ).toBe(true);

      await seedDemoProject(pool);
      const afterSecond = await listAuditEvents(pool, firstSeed.project.id);
      expect(afterSecond.filter((e) => e.action === "key.create")).toHaveLength(2);
      expect(await listApiKeysByProject(pool, firstSeed.project.id)).toHaveLength(2);

      const evalRow = (await listApiKeysByProject(pool, firstSeed.project.id)).find(
        (k) => k.type === "evaluate" && k.revokedAt === null,
      );
      expect(evalRow).toBeDefined();
      await revokeApiKey(pool, evalRow?.id ?? "");
      const replenished = await seedDemoProject(pool);
      expect(replenished.evaluateKey).toBeDefined();
      expect(replenished.adminKey).toBeUndefined();
      const afterReplenish = await listAuditEvents(pool, firstSeed.project.id);
      expect(afterReplenish.filter((e) => e.action === "key.create")).toHaveLength(3);
      expect(await listApiKeysByProject(pool, firstSeed.project.id)).toHaveLength(3);
    });
  });

  it("lists metadata and revokes an evaluate key so the next request is 401 with one key.revoke", async () => {
    await withTestPool(async (pool) => {
      const created = await createProjectWithKeys(pool, { name: "Revoke A", slug: "revoke-a" });
      const chunks: string[] = [];
      const app = await buildApp(
        { NODE_ENV: "test", LOG_LEVEL: "info" },
        { pool, logDestination: { write: (chunk) => chunks.push(chunk) } },
      );
      const admin = { authorization: `Bearer ${created.adminKey.raw}` };
      const evalH = { authorization: `Bearer ${created.evaluateKey.raw}` };

      const listed = await app.inject({ method: "GET", url: "/v1/keys", headers: admin });
      expect(listed.statusCode).toBe(200);
      const listBody = json(listed) as KeyListJson;
      expect(listBody.items).toHaveLength(2);
      expect(listBody.items.every((item) => item.prefix.length > 0)).toBe(true);
      expect(JSON.stringify(listBody)).not.toContain(created.adminKey.raw);
      expect(JSON.stringify(listBody)).not.toContain(created.evaluateKey.raw);
      expect(JSON.stringify(listBody)).not.toContain("key_hash");
      expect(JSON.stringify(listBody)).not.toContain(created.adminKey.keyHash);
      const evalMeta = listBody.items.find((item) => item.type === "evaluate");
      expect(evalMeta?.revoked_at).toBeNull();

      const revoked = await app.inject({
        method: "POST",
        url: `/v1/keys/${evalMeta?.id ?? "missing"}/revoke`,
        headers: admin,
      });
      expect(revoked.statusCode).toBe(200);
      const revokedBody = json(revoked) as KeyMetadataJson;
      expect(revokedBody.revoked_at).toBeTypeOf("string");
      expect(JSON.stringify(revokedBody)).not.toContain(created.evaluateKey.raw);
      expect(JSON.stringify(revokedBody)).not.toContain("key_hash");

      const after = await app.inject({
        method: "POST",
        url: "/v1/evaluate",
        headers: { ...evalH, "content-type": "application/json" },
        payload: { flag_key: "missing_flag", env: "dev", user: { id: "u1" } },
      });
      expect(after.statusCode).toBe(401);
      expect(after.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });

      const audit = await app.inject({
        method: "GET",
        url: "/v1/audit?action=key.revoke",
        headers: admin,
      });
      const auditBody = json(audit) as AuditListJson;
      expect(auditBody.items).toHaveLength(1);
      expect(auditBody.items[0]?.actor_key_id).not.toBeNull();
      expect(auditBody.items[0]?.entity_id).toBe(evalMeta?.id);
      expect(auditBody.items[0]?.request_id.length).toBeGreaterThan(0);
      expect(JSON.stringify(auditBody)).not.toContain(created.adminKey.raw);
      expect(JSON.stringify(auditBody)).not.toContain("key_hash");

      const logs = chunks.join("");
      expect(logs).not.toContain(created.adminKey.raw);
      expect(logs).not.toContain(created.evaluateKey.raw);
      expect(logs).not.toContain(created.adminKey.keyHash);
      await app.close();
    });
  });

  it("isolates projects, forbids evaluate keys, 404s unknown targets, and keeps revoke idempotent under concurrency", async () => {
    await withTestPool(async (pool) => {
      const a = await createProjectWithKeys(pool, { name: "Iso A", slug: "iso-a" });
      const b = await createProjectWithKeys(pool, { name: "Iso B", slug: "iso-b" });
      const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" }, { pool });
      const adminA = { authorization: `Bearer ${a.adminKey.raw}` };
      const evalA = { authorization: `Bearer ${a.evaluateKey.raw}` };
      const adminB = { authorization: `Bearer ${b.adminKey.raw}` };
      const bKeys = await listProjectApiKeys(pool, b.project.id);
      const bEval = bKeys.items.find((item) => item.type === "evaluate");
      const aEval = (await listProjectApiKeys(pool, a.project.id)).items.find(
        (item) => item.type === "evaluate",
      );

      expect(
        (await app.inject({ method: "GET", url: "/v1/keys", headers: evalA })).statusCode,
      ).toBe(403);
      expect((await app.inject({ method: "GET", url: "/v1/keys" })).statusCode).toBe(401);
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/v1/keys/${aEval?.id ?? "missing"}/revoke`,
            headers: evalA,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/v1/keys/${aEval?.id ?? "missing"}/revoke`,
          })
        ).statusCode,
      ).toBe(401);

      const foreignList = await app.inject({ method: "GET", url: "/v1/keys", headers: adminA });
      const foreignBody = json(foreignList) as KeyListJson;
      expect(foreignBody.items.every((item) => item.id !== bEval?.id)).toBe(true);

      const foreignRevoke = await app.inject({
        method: "POST",
        url: `/v1/keys/${bEval?.id ?? "missing"}/revoke`,
        headers: adminA,
      });
      expect(foreignRevoke.statusCode).toBe(404);
      expect(foreignRevoke.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/v1/keys",
            headers: adminB,
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          json(await app.inject({ method: "GET", url: "/v1/keys", headers: adminB })) as KeyListJson
        ).items.find((item) => item.id === bEval?.id)?.revoked_at,
      ).toBeNull();

      const missing = await app.inject({
        method: "POST",
        url: "/v1/keys/11111111-1111-4111-8111-111111111111/revoke",
        headers: adminA,
      });
      expect(missing.statusCode).toBe(404);
      const badId = await app.inject({
        method: "POST",
        url: "/v1/keys/not-a-uuid/revoke",
        headers: adminA,
      });
      expect(badId.statusCode).toBe(400);

      const first = await app.inject({
        method: "POST",
        url: `/v1/keys/${aEval?.id ?? "missing"}/revoke`,
        headers: adminA,
      });
      expect(first.statusCode).toBe(200);
      const firstBody = json(first) as KeyMetadataJson;
      const second = await app.inject({
        method: "POST",
        url: `/v1/keys/${aEval?.id ?? "missing"}/revoke`,
        headers: adminA,
      });
      expect(second.statusCode).toBe(200);
      expect((json(second) as KeyMetadataJson).revoked_at).toBe(firstBody.revoked_at);
      const revokes = (await listAuditEvents(pool, a.project.id)).filter(
        (e) => e.action === "key.revoke",
      );
      expect(revokes).toHaveLength(1);

      const liveEvaluate = (await listProjectApiKeys(pool, b.project.id)).items.find(
        (item) => item.type === "evaluate",
      );
      const [c1, c2] = await Promise.all([
        app.inject({
          method: "POST",
          url: `/v1/keys/${liveEvaluate?.id ?? "missing"}/revoke`,
          headers: adminB,
        }),
        app.inject({
          method: "POST",
          url: `/v1/keys/${liveEvaluate?.id ?? "missing"}/revoke`,
          headers: adminB,
        }),
      ]);
      expect(c1.statusCode).toBe(200);
      expect(c2.statusCode).toBe(200);
      const t1 = (json(c1) as KeyMetadataJson).revoked_at;
      const t2 = (json(c2) as KeyMetadataJson).revoked_at;
      expect(t1).toBe(t2);
      expect(
        (await listAuditEvents(pool, b.project.id)).filter((e) => e.action === "key.revoke"),
      ).toHaveLength(1);
      await app.close();
    });
  });

  it("rolls back mint and revoke when audit insert fails and keeps the append-only trigger", async () => {
    await withTestPool(async (pool) => {
      await installFailingKeyAudit(pool);
      await expect(
        createProjectWithKeys(pool, { name: "Fail Mint", slug: "fail-mint" }),
      ).rejects.toThrow(/injected audit failure/);
      const keys = await pool.query("SELECT id FROM api_keys");
      expect(keys.rows).toHaveLength(0);
      const events = await pool.query("SELECT id FROM audit_events");
      expect(events.rows).toHaveLength(0);

      await pool.query("DROP TRIGGER fail_key_audit ON audit_events");
      const created = await createProjectWithKeys(pool, {
        name: "Fail Revoke",
        slug: "fail-revoke",
      });
      await pool.query(`
        CREATE TRIGGER fail_key_audit
          BEFORE INSERT ON audit_events
          FOR EACH ROW
          EXECUTE FUNCTION fail_key_audit();
      `);
      const evalRow = (await listApiKeysByProject(pool, created.project.id)).find(
        (k) => k.type === "evaluate",
      );
      await expect(
        revokeProjectApiKey(
          pool,
          {
            projectId: created.project.id,
            actorKeyId: null,
            requestId: "cli:keys-revoke:test",
          },
          evalRow?.id ?? "",
        ),
      ).rejects.toThrow(/injected audit failure/);
      const stillLive = await listApiKeysByProject(pool, created.project.id);
      expect(stillLive.find((k) => k.id === evalRow?.id)?.revokedAt).toBeNull();
      expect(
        (await listAuditEvents(pool, created.project.id)).filter((e) => e.action === "key.revoke"),
      ).toHaveLength(0);

      await expect(pool.query("UPDATE audit_events SET action = 'x'")).rejects.toThrow(
        /append-only/,
      );
      await expect(pool.query("DELETE FROM audit_events")).rejects.toThrow(/append-only/);
    });
  });

  it("allows null actor_key_id, keeps the FK, and self-revoke of the admin key yields 401", async () => {
    await withTestPool(async (pool) => {
      const col = await pool.query<{ is_nullable: string }>(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'audit_events' AND column_name = 'actor_key_id'`,
      );
      expect(col.rows[0]?.is_nullable).toBe("YES");
      const fk = await pool.query<{ confdeltype: string }>(
        `SELECT confdeltype FROM pg_constraint
         WHERE conrelid = 'audit_events'::regclass AND contype = 'f'
           AND pg_get_constraintdef(oid) LIKE '%actor_key_id%'`,
      );
      expect(fk.rows.length).toBeGreaterThan(0);

      const created = await createProjectWithKeys(pool, { name: "Self", slug: "self-proj" });
      const creates = (await listAuditEvents(pool, created.project.id)).filter(
        (e) => e.action === "key.create",
      );
      expect(creates.every((e) => e.actorKeyId === null)).toBe(true);
      await expect(
        pool.query(
          `INSERT INTO audit_events (project_id, actor_key_id, action, entity_type, entity_id, request_id)
           VALUES ($1, $2, 'key.revoke', 'key', $3, 'fk-check')`,
          [created.project.id, "11111111-1111-4111-8111-111111111111", created.project.id],
        ),
      ).rejects.toThrow();

      const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" }, { pool });
      const admin = { authorization: `Bearer ${created.adminKey.raw}` };
      const listed = json(
        await app.inject({ method: "GET", url: "/v1/keys", headers: admin }),
      ) as KeyListJson;
      const adminMeta = listed.items.find((item) => item.type === "admin");
      const self = await app.inject({
        method: "POST",
        url: `/v1/keys/${adminMeta?.id ?? "missing"}/revoke`,
        headers: admin,
      });
      expect(self.statusCode).toBe(200);
      const next = await app.inject({ method: "GET", url: "/v1/keys", headers: admin });
      expect(next.statusCode).toBe(401);
      await app.close();
    });
  });
});
