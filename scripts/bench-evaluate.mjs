#!/usr/bin/env node
/**
 * Soft in-process evaluate microbench (NFR-PERF-001). Not a CI gate.
 *
 *   pnpm build && node scripts/bench-evaluate.mjs
 *
 * Budget: p99 < 10ms for ≤ 20 rules. This script reports mean / p99 of 20k calls.
 */

import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import path from "node:path";

const moduleUrl = pathToFileURL(
  path.resolve(import.meta.dirname, "../dist/domain/evaluate/index.js"),
).href;

if (!existsSync(path.resolve(import.meta.dirname, "../dist/domain/evaluate/index.js"))) {
  console.error("bench-evaluate: dist/ missing. Run `pnpm build` first.");
  process.exit(1);
}

const { compileSnapshot, evaluate } = await import(moduleUrl);

const rules = Array.from({ length: 20 }, (_, i) => ({
  attribute: i === 19 ? "user.plan" : `user.attr_${String(i)}`,
  op: "eq",
  value: i === 19 ? "pro" : "nope",
  serve: true,
}));

const snapshot = compileSnapshot({
  projectId: "bench",
  env: "prod",
  salt: "fixture-salt",
  flags: [
    {
      key: "checkout_v2",
      archived: false,
      defaultValue: false,
      enabled: true,
      percentage: 50,
      rules,
    },
  ],
});

const flag = snapshot.flags.get("checkout_v2");
const user = { id: "user-76", attrs: { plan: "pro" } };
const iterations = 20_000;
const samples = [];

for (let i = 0; i < iterations; i += 1) {
  const t0 = performance.now();
  evaluate(flag, user, snapshot.salt);
  samples.push(performance.now() - t0);
}

samples.sort((a, b) => a - b);
const mean = samples.reduce((sum, n) => sum + n, 0) / samples.length;
const p99 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.99))];
console.log(
  `bench-evaluate: ${String(iterations)} calls, 20 rules, mean ${mean.toFixed(4)}ms, p99 ${p99.toFixed(4)}ms (soft budget p99 < 10ms)`,
);
if (p99 >= 10) {
  console.warn(
    `bench-evaluate: WARN p99 ${p99.toFixed(4)}ms is at or above the 10ms in-process budget (soft; not a CI failure)`,
  );
}
