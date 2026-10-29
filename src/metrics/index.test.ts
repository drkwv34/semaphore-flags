import { describe, expect, it } from "vitest";

import { createMetrics } from "./index.js";

describe("metrics (FR-OPS-002)", () => {
  it("exposes evaluate, admin, and cache counters after traffic", async () => {
    const metrics = createMetrics();
    metrics.recordEvaluate(["disabled", "not_found"], 0.002, "batch");
    metrics.recordEvaluate(["rule_match"], 0.001, "single");
    metrics.recordAdminMutation("flag.create");
    metrics.recordCache("hit");
    metrics.recordCache("miss");
    metrics.recordInvalidationFailure();

    const text = await metrics.metricsText();
    expect(text).toMatch(/semaphore_evaluate_total\{reason="disabled"\} 1/);
    expect(text).toMatch(/semaphore_evaluate_total\{reason="not_found"\} 1/);
    expect(text).toMatch(/semaphore_evaluate_total\{reason="rule_match"\} 1/);
    expect(text).toContain("semaphore_evaluate_duration_seconds");
    expect(text).toMatch(/semaphore_admin_mutations_total\{action="flag.create"\} 1/);
    expect(text).toMatch(/semaphore_cache_requests_total\{result="hit"\} 1/);
    expect(text).toMatch(/semaphore_cache_requests_total\{result="miss"\} 1/);
    expect(text).toContain("semaphore_cache_invalidation_failures_total");
  });
});
