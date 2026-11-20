import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compose = readFileSync(path.join(repoRoot, "compose.yaml"), "utf8");

describe("compose demo-client profile", () => {
  it("puts demo-client behind the demo profile", () => {
    expect(compose).toContain(
      '\n  demo-client:\n    image: node:22-alpine\n    profiles: ["demo"]\n',
    );
  });

  it("does not put api or db behind a profile", () => {
    const apiSection = compose.split("\n  api:\n")[1]?.split("\n  db:\n")[0] ?? "";
    const dbSection = compose.split("\n  db:\n")[1]?.split("\n  redis:\n")[0] ?? "";
    expect(apiSection.includes("profiles:")).toBe(false);
    expect(dbSection.includes("profiles:")).toBe(false);
  });
});
