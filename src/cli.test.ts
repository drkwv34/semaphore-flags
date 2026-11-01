import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseCli, writeSeedKeysFile } from "./cli.js";

describe("parseCli", () => {
  it("lists the four commands on help", () => {
    expect(parseCli(["node", "cli", "--help"]).name).toBe("help");
    expect(parseCli(["node", "cli"]).name).toBe("help");
  });

  it("parses migrate, seed, and serve", () => {
    expect(parseCli(["node", "cli", "migrate"])).toEqual({ name: "migrate" });
    expect(parseCli(["node", "cli", "seed"])).toEqual({ name: "seed" });
    expect(parseCli(["node", "cli", "serve"])).toEqual({ name: "serve" });
  });

  it("parses projects create --name --slug", () => {
    expect(
      parseCli(["node", "cli", "projects", "create", "--name", "Acme", "--slug", "acme"]),
    ).toEqual({
      name: "projects-create",
      nameFlag: "Acme",
      slug: "acme",
    });
  });

  it("rejects projects create without flags", () => {
    expect(parseCli(["node", "cli", "projects", "create"]).name).toBe("error");
  });
});

describe("writeSeedKeysFile", () => {
  it("writes admin and evaluate keys as JSON", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "semaphore-seed-keys-"));
    const filePath = path.join(dir, "nested", "demo-keys.json");
    await writeSeedKeysFile(filePath, {
      adminKey: "sf_admin_deadbeef_aa",
      evaluateKey: "sf_eval_deadbeef_bb",
    });
    const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
    expect(parsed).toEqual({
      admin_key: "sf_admin_deadbeef_aa",
      evaluate_key: "sf_eval_deadbeef_bb",
    });
  });
});
