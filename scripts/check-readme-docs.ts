// Assert README Client integration (FR-DOC-001) and that relative markdown links exist.

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readmePath = path.join(repoRoot, "README.md");
const readme = readFileSync(readmePath, "utf8");

function fail(message: string): never {
  process.stderr.write(`check-readme-docs: ${message}\n`);
  process.exit(1);
}

const clientOffset = readme.indexOf("## Client integration");
if (clientOffset === -1) {
  fail("README is missing a '## Client integration' heading");
}

const nextHeading = readme.indexOf("\n## ", clientOffset + 1);
const clientSection = readme.slice(clientOffset, nextHeading === -1 ? undefined : nextHeading);

const required = [
  {
    name: "100–200 ms timeouts",
    pattern: /100\s*[–-]\s*200\s*ms/i,
  },
  {
    name: "client_fallback mapping",
    pattern: /client_fallback/,
  },
  {
    name: "fail_closed → false",
    pattern: /fail_closed/,
  },
  {
    name: "fail_open → true",
    pattern: /fail_open/,
  },
  {
    name: "kill switches use fail_closed",
    pattern: /kill switch[\s\S]{0,80}fail_closed/i,
  },
  {
    name: "in-process cache ≤10 s",
    pattern: /(≤\s*10|<=\s*10|at most 10|10\s*s(ec(onds)?)?)/i,
  },
  {
    name: "never block app boot",
    pattern:
      /never block[\s\S]{0,40}boot|must not block[\s\S]{0,40}boot|boot[\s\S]{0,80}indefinitely/i,
  },
] as const;

for (const item of required) {
  if (!item.pattern.test(clientSection)) {
    fail(`Client integration section is missing ${item.name}`);
  }
}

const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
const missing: string[] = [];
for (const match of readme.matchAll(linkPattern)) {
  const raw = match[1];
  if (raw === undefined) continue;
  const target = raw.trim();
  if (
    target.startsWith("http://") ||
    target.startsWith("https://") ||
    target.startsWith("mailto:") ||
    target.startsWith("#")
  ) {
    continue;
  }
  const withoutAnchor = target.split("#")[0] ?? target;
  if (withoutAnchor.length === 0) continue;
  const resolved = path.resolve(repoRoot, withoutAnchor);
  if (!existsSync(resolved)) {
    missing.push(target);
    continue;
  }
  const st = statSync(resolved);
  if (!st.isFile() && !st.isDirectory()) {
    missing.push(target);
  }
}

if (missing.length > 0) {
  fail(`broken relative README links: ${missing.join(", ")}`);
}

process.stdout.write("check-readme-docs: ok\n");
