import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts/bench-evaluate.sh");

function runBench(opts: {
  times?: readonly number[];
  httpCode?: string;
  key?: string | undefined;
  extraEnv?: NodeJS.ProcessEnv;
}): { status: number | null; stdout: string; stderr: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "bench-evaluate-"));
  const curlPath = path.join(dir, "curl");
  const times = opts.times ?? [];
  const httpCode = opts.httpCode ?? "200";
  writeFileSync(
    curlPath,
    `#!/bin/sh
state="${dir}/n"
n=0
if [ -f "$state" ]; then
  n=$(cat "$state")
fi
n=$((n + 1))
printf '%s' "$n" > "$state"
times="${times.join(" ")}"
code="${httpCode}"
i=0
for t in $times; do
  i=$((i + 1))
  if [ "$i" -eq "$n" ]; then
    printf '%s %s\\n' "$code" "$t"
    exit 0
  fi
done
printf '%s 0.001\\n' "$code"
exit 0
`,
    { mode: 0o755 },
  );

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${dir}:${process.env.PATH ?? ""}`,
    BENCH_WARM: "0",
    BENCH_ITERS: String(times.length || 1),
    CURL: curlPath,
    LC_ALL: "C",
    ...opts.extraEnv,
  };
  if (opts.key === undefined) {
    delete env.EVALUATE_KEY;
  } else {
    env.EVALUATE_KEY = opts.key;
  }

  const result = spawnSync("bash", [script], { env, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function expectedP99(sortedMs: readonly number[]): number {
  const n = sortedMs.length;
  let idx = Math.trunc(n * 0.99);
  if (idx < 1) idx = 1;
  if (idx > n) idx = n;
  return sortedMs[idx - 1] ?? 0;
}

describe("bench-evaluate.sh", () => {
  it("exits 2 when EVALUATE_KEY is missing", () => {
    const result = runBench({ key: undefined, times: [0.01] });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/EVALUATE_KEY/);
  });

  it("computes mean and p99 for one sample under POSIX awk", () => {
    const result = runBench({ key: "sf_eval_test", times: [0.01], extraEnv: { BENCH_ITERS: "1" } });
    expect(result.stderr).not.toMatch(/asort/);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/1 HTTP calls, mean 10\.000ms, p99 10\.000ms/);
  });

  it("sorts unsorted samples and matches hand-computed mean and p99", () => {
    const ms = Array.from({ length: 200 }, (_, i) => i + 1);
    const shuffled = [...ms].reverse();
    const times = shuffled.map((value) => value / 1000);
    const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
    const p99 = expectedP99(ms);
    const result = runBench({
      key: "sf_eval_test",
      times,
      extraEnv: { BENCH_ITERS: "200", BENCH_WARM: "0" },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      `200 HTTP calls, mean ${mean.toFixed(3)}ms, p99 ${p99.toFixed(3)}ms`,
    );
  });

  it("exits non-zero when evaluate returns a non-200 status", () => {
    const result = runBench({
      key: "sf_eval_test",
      times: [0.01],
      httpCode: "500",
      extraEnv: { BENCH_ITERS: "1" },
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/HTTP 500/);
    expect(result.stdout).not.toMatch(/HTTP calls, mean/);
  });
});
