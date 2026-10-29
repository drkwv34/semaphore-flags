import { describe, expect, it } from "vitest";

import { compileSnapshot, type SnapshotSource } from "../domain/evaluate/index.js";
import { createMetrics } from "../metrics/index.js";
import {
  CACHE_TTL_SECONDS,
  CachedSnapshotSource,
  FailureCircuit,
  cacheKey,
  deserializeSnapshot,
  memoryCacheStore,
  serializeSnapshot,
  SNAPSHOT_SCHEMA_VERSION,
  silentCacheLog,
} from "./index.js";
import { Singleflight } from "./singleflight.js";

const PROJECT = "11111111-1111-4111-8111-111111111111";

function snapshot() {
  return compileSnapshot({
    projectId: PROJECT,
    env: "dev",
    salt: "salt",
    flags: [
      {
        key: "checkout_v2",
        archived: false,
        defaultValue: false,
        enabled: true,
        percentage: 100,
        rules: [],
      },
    ],
  });
}

function countingSource(onLoad?: () => void): SnapshotSource & { loads: number } {
  const snap = snapshot();
  const source = {
    loads: 0,
    get(projectId: string, env: string) {
      source.loads += 1;
      onLoad?.();
      if (projectId !== PROJECT || env !== "dev") return Promise.resolve(undefined);
      return Promise.resolve(snap);
    },
  };
  return source;
}

describe("snapshot serialize (FR-CACHE-001)", () => {
  it("round-trips a compiled snapshot", () => {
    const original = snapshot();
    const restored = deserializeSnapshot(serializeSnapshot(original));
    expect(restored?.projectId).toBe(original.projectId);
    expect(restored?.env).toBe(original.env);
    expect(restored?.salt).toBe(original.salt);
    expect(restored?.flags.get("checkout_v2")).toEqual(original.flags.get("checkout_v2"));
  });

  it("treats a schema_version mismatch as a miss", () => {
    const raw = serializeSnapshot(snapshot());
    const parsed = JSON.parse(raw) as { schema_version: number };
    parsed.schema_version = SNAPSHOT_SCHEMA_VERSION + 1;
    expect(deserializeSnapshot(JSON.stringify(parsed))).toBeUndefined();
  });
});

describe("cacheKey", () => {
  it("uses flags:{project_id}:{env}", () => {
    expect(cacheKey(PROJECT, "prod")).toBe(`flags:${PROJECT}:prod`);
    expect(CACHE_TTL_SECONDS).toBe(60);
  });
});

describe("CachedSnapshotSource", () => {
  it("passthrough when Redis is disabled", async () => {
    const inner = countingSource();
    const cache = new CachedSnapshotSource(
      inner,
      {
        enabled: false,
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
        del: () => Promise.resolve(),
        ping: () => Promise.resolve(false),
        close: () => Promise.resolve(),
      },
      createMetrics(),
      silentCacheLog(),
    );
    const first = await cache.get(PROJECT, "dev");
    const second = await cache.get(PROJECT, "dev");
    expect(first?.flags.get("checkout_v2")?.percentage).toBe(100);
    expect(second?.flags.get("checkout_v2")?.percentage).toBe(100);
    expect(inner.loads).toBe(2);
  });

  it("fills on miss and hits on the next get", async () => {
    const inner = countingSource();
    const metrics = createMetrics();
    const cache = new CachedSnapshotSource(inner, memoryCacheStore(), metrics, silentCacheLog());
    await cache.get(PROJECT, "dev");
    await cache.get(PROJECT, "dev");
    expect(inner.loads).toBe(1);
    const text = await metrics.metricsText();
    expect(text).toMatch(/semaphore_cache_requests_total\{result="miss"\} 1/);
    expect(text).toMatch(/semaphore_cache_requests_total\{result="hit"\} 1/);
  });

  it("loads Postgres once under concurrent misses (FR-CACHE-003)", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inner = countingSource(() => {
      // hold the first load open so later callers join singleflight
    });
    const delayed: SnapshotSource = {
      async get(projectId, env) {
        await gate;
        return inner.get(projectId, env);
      },
    };
    const cache = new CachedSnapshotSource(
      delayed,
      memoryCacheStore(),
      createMetrics(),
      silentCacheLog(),
    );

    const pending = [
      cache.get(PROJECT, "dev"),
      cache.get(PROJECT, "dev"),
      cache.get(PROJECT, "dev"),
    ];
    release?.();
    const results = await Promise.all(pending);
    expect(inner.loads).toBe(1);
    expect(results.every((r) => r?.flags.get("checkout_v2")?.enabled === true)).toBe(true);
  });

  it("skips Redis after the circuit opens (FR-CACHE-004)", async () => {
    let now = 1_000;
    const circuit = new FailureCircuit(3, 5_000, () => now);
    let gets = 0;
    const failingStore = {
      enabled: true,
      get() {
        gets += 1;
        return Promise.reject(new Error("ECONNREFUSED"));
      },
      set() {
        return Promise.reject(new Error("ECONNREFUSED"));
      },
      del() {
        return Promise.reject(new Error("ECONNREFUSED"));
      },
      ping() {
        return Promise.resolve(false);
      },
      close() {
        return Promise.resolve();
      },
    };
    const inner = countingSource();
    const cache = new CachedSnapshotSource(
      inner,
      failingStore,
      createMetrics(),
      silentCacheLog(),
      () => now,
      circuit,
    );

    await cache.get(PROJECT, "dev");
    await cache.get(PROJECT, "dev");
    await cache.get(PROJECT, "dev");
    const before = gets;
    await cache.get(PROJECT, "dev");
    expect(gets).toBe(before);
    expect(inner.loads).toBe(4);
    expect(circuit.isOpen).toBe(true);

    now += 5_001;
    await cache.get(PROJECT, "dev");
    expect(gets).toBe(before + 1);
  });

  it("does not throw when invalidation fails", async () => {
    const inner = countingSource();
    const metrics = createMetrics();
    const cache = new CachedSnapshotSource(
      inner,
      {
        enabled: true,
        get: () => Promise.resolve(null),
        set: () => Promise.resolve(),
        del: () => Promise.reject(new Error("down")),
        ping: () => Promise.resolve(false),
        close: () => Promise.resolve(),
      },
      metrics,
      silentCacheLog(),
    );
    await expect(cache.invalidateEnvs(PROJECT, ["dev", "prod"])).resolves.toBeUndefined();
    const text = await metrics.metricsText();
    expect(text).toMatch(/semaphore_cache_invalidation_failures_total 2/);
  });
});

describe("Singleflight export", () => {
  it("is available from the cache module", () => {
    expect(new Singleflight().size).toBe(0);
  });
});
