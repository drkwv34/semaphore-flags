import { describe, expect, it } from "vitest";

import { ConflictError } from "../../src/domain/errors.js";
import { createProjectWithKeys } from "../../src/services/projects.js";
import { findProjectBySlug, migrate } from "../../src/store/index.js";
import { withTestPool } from "./helpers.js";

describe("store + migrate (NFR-SEC-002)", () => {
  it("applies migrations then is a no-op, and looks up a project by slug", async () => {
    await withTestPool(async (pool) => {
      const again = await migrate(pool);
      expect(again.applied).toEqual([]);

      const created = await createProjectWithKeys(pool, { name: "Look", slug: "look-up" });
      const found = await findProjectBySlug(pool, "look-up");
      expect(found?.id).toBe(created.project.id);
      expect(found?.salt.length).toBeGreaterThan(0);

      await expect(
        createProjectWithKeys(pool, { name: "Look 2", slug: "look-up" }),
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });
});
