import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/api/app.js";
import type { AuditItemJson, AuditListJson } from "../../src/services/audit.js";
import type { FlagDetailJson } from "../../src/services/flags.js";
import { createProjectWithKeys } from "../../src/services/projects.js";
import { withTestPool } from "./helpers.js";

function json(res: { json: () => unknown }): unknown {
  return res.json();
}

describe("GET /v1/audit (FR-AUD-003, NFR-SEC-001, FR-AUD-004)", () => {
  it("is admin-only, project-scoped, filterable, and paginated without gaps", async () => {
    await withTestPool(async (pool) => {
      const a = await createProjectWithKeys(pool, { name: "Audit A", slug: "audit-a" });
      const b = await createProjectWithKeys(pool, { name: "Audit B", slug: "audit-b" });
      const app = buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" }, { pool });
      const adminA = {
        authorization: `Bearer ${a.adminKey.raw}`,
        "content-type": "application/json",
      };
      const evalA = { authorization: `Bearer ${a.evaluateKey.raw}` };
      const adminB = {
        authorization: `Bearer ${b.adminKey.raw}`,
        "content-type": "application/json",
      };

      expect(
        (await app.inject({ method: "GET", url: "/v1/audit", headers: evalA })).statusCode,
      ).toBe(403);

      const createdFlag = await app.inject({
        method: "POST",
        url: "/v1/flags",
        headers: adminA,
        payload: { key: "checkout_v2", default_value: false },
      });
      expect(createdFlag.statusCode).toBe(201);
      const flag = json(createdFlag) as FlagDetailJson;

      expect(
        (
          await app.inject({
            method: "PATCH",
            url: "/v1/flags/checkout_v2",
            headers: adminA,
            payload: { description: "Checkout" },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: "PUT",
            url: "/v1/flags/checkout_v2/envs/dev",
            headers: adminA,
            payload: {
              enabled: true,
              percentage: 10,
              rules: [{ priority: 0, attribute: "user.plan", op: "eq", value: "pro", serve: true }],
            },
          })
        ).statusCode,
      ).toBe(200);

      expect(
        (
          await app.inject({
            method: "POST",
            url: "/v1/flags",
            headers: adminB,
            payload: { key: "other_flag", default_value: true },
          })
        ).statusCode,
      ).toBe(201);

      const listed = await app.inject({ method: "GET", url: "/v1/audit", headers: adminA });
      expect(listed.statusCode).toBe(200);
      const listedBody = json(listed) as AuditListJson;
      expect(listedBody.items.length).toBeGreaterThan(0);
      expect(listedBody.items.every((item) => item.actor_key_id.length > 0)).toBe(true);
      expect(JSON.stringify(listedBody)).not.toContain(a.adminKey.raw);
      expect(JSON.stringify(listedBody)).not.toContain("other_flag");
      const other = await app.inject({ method: "GET", url: "/v1/audit", headers: adminB });
      const otherBody = json(other) as AuditListJson;
      expect(otherBody.items.some((item) => item.action === "flag.create")).toBe(true);
      const aIds = new Set(listedBody.items.map((item) => item.id));
      expect(otherBody.items.every((item) => !aIds.has(item.id))).toBe(true);

      const byType = await app.inject({
        method: "GET",
        url: "/v1/audit?entity_type=flag",
        headers: adminA,
      });
      expect(
        (json(byType) as AuditListJson).items.every((item) => item.entity_type === "flag"),
      ).toBe(true);

      const byId = await app.inject({
        method: "GET",
        url: `/v1/audit?entity_id=${flag.id}`,
        headers: adminA,
      });
      const byIdBody = json(byId) as AuditListJson;
      expect(byIdBody.items.every((item) => item.entity_id === flag.id)).toBe(true);
      expect(byIdBody.items.length).toBeGreaterThan(0);

      const byAction = await app.inject({
        method: "GET",
        url: "/v1/audit?action=flag.create",
        headers: adminA,
      });
      expect(
        (json(byAction) as AuditListJson).items.every((item) => item.action === "flag.create"),
      ).toBe(true);

      const createRow = listedBody.items.find((item) => item.action === "flag.create");
      expect(createRow).toBeDefined();
      const sinceUntil = await app.inject({
        method: "GET",
        url: `/v1/audit?since=${encodeURIComponent(createRow?.created_at ?? "")}&until=${encodeURIComponent(createRow?.created_at ?? "")}`,
        headers: adminA,
      });
      const windowItems = (json(sinceUntil) as AuditListJson).items;
      expect(windowItems.length).toBeGreaterThan(0);
      expect(
        windowItems.every(
          (item) =>
            item.created_at >= (createRow?.created_at ?? "") &&
            item.created_at <= (createRow?.created_at ?? ""),
        ),
      ).toBe(true);

      expect(
        (
          await app.inject({
            method: "GET",
            url: "/v1/audit?action=nope",
            headers: adminA,
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/v1/audit?limit=201",
            headers: adminA,
          })
        ).statusCode,
      ).toBe(400);

      for (let i = 0; i < 5; i++) {
        const res = await app.inject({
          method: "POST",
          url: "/v1/flags",
          headers: adminA,
          payload: { key: `extra_${String(i)}`, default_value: false },
        });
        expect(res.statusCode).toBe(201);
      }

      const full = await app.inject({
        method: "GET",
        url: "/v1/audit?limit=200",
        headers: adminA,
      });
      const fullItems = (json(full) as AuditListJson).items;
      expect(fullItems.length).toBeGreaterThan(3);

      const collected: AuditItemJson[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 50; page++) {
        const url =
          cursor === null
            ? "/v1/audit?limit=2"
            : `/v1/audit?limit=2&cursor=${encodeURIComponent(cursor)}`;
        const res = await app.inject({ method: "GET", url, headers: adminA });
        expect(res.statusCode).toBe(200);
        const body = json(res) as AuditListJson;
        collected.push(...body.items);
        cursor = body.next_cursor;
        if (cursor === null) break;
      }
      expect(cursor).toBeNull();
      expect(collected.map((item) => item.id)).toEqual(fullItems.map((item) => item.id));
      expect(new Set(collected.map((item) => item.id)).size).toBe(collected.length);

      await expect(pool.query("UPDATE audit_events SET action = 'x'")).rejects.toThrow(
        /append-only/,
      );
      await expect(pool.query("DELETE FROM audit_events")).rejects.toThrow(/append-only/);

      await app.close();
    });
  });
});
