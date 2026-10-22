import { describe, expect, it } from "vitest";

import { parseCli } from "./cli.js";

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
