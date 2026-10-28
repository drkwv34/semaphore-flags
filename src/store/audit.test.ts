import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTs(full));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("audit store SQL (FR-AUD-004)", () => {
  it("never issues UPDATE or DELETE against audit_events in app code", () => {
    const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    for (const file of walkTs(srcRoot)) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/\bUPDATE\s+audit_events\b/i);
      expect(source, file).not.toMatch(/\bDELETE\s+FROM\s+audit_events\b/i);
    }
  });
});
