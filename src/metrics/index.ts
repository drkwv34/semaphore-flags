import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
  type RegistryContentType,
} from "prom-client";

import type { EvaluationReason } from "../domain/evaluate/index.js";

export type CacheResult = "hit" | "miss" | "error";
export type EvaluateEndpoint = "single" | "batch";

const DURATION_BUCKETS = [0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1];

export interface Metrics {
  readonly registry: Registry<RegistryContentType>;
  readonly contentType: string;
  recordEvaluate(
    reasons: readonly EvaluationReason[],
    durationSeconds: number,
    endpoint: EvaluateEndpoint,
  ): void;
  recordAdminMutation(action: string): void;
  recordCache(result: CacheResult): void;
  recordInvalidationFailure(): void;
  metricsText(): Promise<string>;
}

export interface CreateMetricsOptions {
  readonly collectDefaults?: boolean;
}

export function createMetrics(options: CreateMetricsOptions = {}): Metrics {
  const registry = new Registry();
  if (options.collectDefaults === true) {
    collectDefaultMetrics({ register: registry });
  }

  const evaluateTotal = new Counter({
    name: "semaphore_evaluate_total",
    help: "Evaluate results by reason",
    labelNames: ["reason"] as const,
    registers: [registry],
  });
  const evaluateDuration = new Histogram({
    name: "semaphore_evaluate_duration_seconds",
    help: "Evaluate request duration in seconds",
    labelNames: ["endpoint"] as const,
    buckets: DURATION_BUCKETS,
    registers: [registry],
  });
  const adminMutations = new Counter({
    name: "semaphore_admin_mutations_total",
    help: "Admin mutations that committed a change",
    labelNames: ["action"] as const,
    registers: [registry],
  });
  const cacheRequests = new Counter({
    name: "semaphore_cache_requests_total",
    help: "Compiled snapshot cache lookups",
    labelNames: ["result"] as const,
    registers: [registry],
  });
  const invalidationFailures = new Counter({
    name: "semaphore_cache_invalidation_failures_total",
    help: "Cache key deletions that failed after a committed mutation",
    registers: [registry],
  });

  return {
    registry,
    contentType: registry.contentType,
    recordEvaluate(reasons, durationSeconds, endpoint) {
      for (const reason of reasons) {
        evaluateTotal.inc({ reason });
      }
      evaluateDuration.observe({ endpoint }, durationSeconds);
    },
    recordAdminMutation(action) {
      adminMutations.inc({ action });
    },
    recordCache(result) {
      cacheRequests.inc({ result });
    },
    recordInvalidationFailure() {
      invalidationFailures.inc();
    },
    metricsText() {
      return registry.metrics();
    },
  };
}
