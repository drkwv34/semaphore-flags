import { Redis } from "ioredis";

import {
  compileSnapshot,
  type CompiledEnvSnapshot,
  type CompiledFlag,
  type CompiledRule,
  type SnapshotSource,
} from "../domain/evaluate/index.js";
import type { JsonPrimitive } from "../domain/rules/index.js";
import type { Metrics } from "../metrics/index.js";
import { Singleflight } from "./singleflight.js";

export { Singleflight } from "./singleflight.js";

export const CACHE_TTL_SECONDS = 60;
export const SNAPSHOT_SCHEMA_VERSION = 1;
export const REDIS_WARN_INTERVAL_MS = 10_000;

export function cacheKey(projectId: string, env: string): string {
  return `flags:${projectId}:${env}`;
}

export interface CacheLogger {
  warn: (obj: object, msg: string) => void;
  debug: (obj: object, msg: string) => void;
}

export interface CacheStore {
  readonly enabled: boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export interface SnapshotCache extends SnapshotSource {
  readonly enabled: boolean;
  invalidateEnvs(projectId: string, envs: readonly string[]): Promise<void>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export interface CachedPayload {
  readonly schema_version: number;
  readonly project_id: string;
  readonly env: string;
  readonly salt: string;
  readonly flags: readonly CompiledFlag[];
}

export function serializeSnapshot(snapshot: CompiledEnvSnapshot): string {
  const payload: CachedPayload = {
    schema_version: SNAPSHOT_SCHEMA_VERSION,
    project_id: snapshot.projectId,
    env: snapshot.env,
    salt: snapshot.salt,
    flags: [...snapshot.flags.values()],
  };
  return JSON.stringify(payload);
}

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function isRule(value: unknown): value is CompiledRule {
  if (value === null || typeof value !== "object") return false;
  const rule = value as Record<string, unknown>;
  if (typeof rule.attribute !== "string" || typeof rule.op !== "string") return false;
  if (typeof rule.serve !== "boolean") return false;
  if (Array.isArray(rule.value)) return rule.value.every(isJsonPrimitive);
  return isJsonPrimitive(rule.value);
}

function isCompiledFlag(value: unknown): value is CompiledFlag {
  if (value === null || typeof value !== "object") return false;
  const flag = value as Record<string, unknown>;
  return (
    typeof flag.key === "string" &&
    typeof flag.archived === "boolean" &&
    typeof flag.defaultValue === "boolean" &&
    typeof flag.enabled === "boolean" &&
    typeof flag.percentage === "number" &&
    Array.isArray(flag.rules) &&
    flag.rules.every(isRule)
  );
}

export function deserializeSnapshot(raw: string): CompiledEnvSnapshot | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return undefined;
    const body = parsed as Record<string, unknown>;
    if (body.schema_version !== SNAPSHOT_SCHEMA_VERSION) return undefined;
    if (
      typeof body.project_id !== "string" ||
      typeof body.env !== "string" ||
      typeof body.salt !== "string" ||
      !Array.isArray(body.flags) ||
      !body.flags.every(isCompiledFlag)
    ) {
      return undefined;
    }
    return compileSnapshot({
      projectId: body.project_id,
      env: body.env,
      salt: body.salt,
      flags: body.flags,
    });
  } catch {
    return undefined;
  }
}

export function disabledCacheStore(): CacheStore {
  return {
    enabled: false,
    get() {
      return Promise.resolve(null);
    },
    set() {
      return Promise.resolve();
    },
    del() {
      return Promise.resolve();
    },
    ping() {
      return Promise.resolve(false);
    },
    close() {
      return Promise.resolve();
    },
  };
}

export function memoryCacheStore(): CacheStore {
  const data = new Map<string, string>();
  return {
    enabled: true,
    get(key) {
      return Promise.resolve(data.get(key) ?? null);
    },
    set(key, value) {
      data.set(key, value);
      return Promise.resolve();
    },
    del(key) {
      data.delete(key);
      return Promise.resolve();
    },
    ping() {
      return Promise.resolve(true);
    },
    close() {
      data.clear();
      return Promise.resolve();
    },
  };
}

export class FailureCircuit {
  private failures = 0;
  private openUntil = 0;

  constructor(
    private readonly threshold = 3,
    private readonly cooldownMs = 5000,
    private readonly now: () => number = Date.now,
  ) {}

  get isOpen(): boolean {
    return this.now() < this.openUntil;
  }

  success(): void {
    this.failures = 0;
  }

  failure(): void {
    this.failures += 1;
    if (this.failures >= this.threshold) {
      this.openUntil = this.now() + this.cooldownMs;
      this.failures = 0;
    }
  }
}

export function createRedisStore(url: string): CacheStore {
  const redis = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    connectTimeout: 500,
    commandTimeout: 50,
  });
  redis.on("error", () => {
    // Call sites handle errors; this listener prevents an unhandled 'error' crash.
  });

  const ensure = async (): Promise<void> => {
    if (redis.status === "ready") return;
    await redis.connect();
  };

  return {
    enabled: true,
    async get(key) {
      await ensure();
      return redis.get(key);
    },
    async set(key, value, ttlSeconds) {
      await ensure();
      await redis.set(key, value, "EX", ttlSeconds);
    },
    async del(key) {
      await ensure();
      await redis.del(key);
    },
    async ping() {
      try {
        await ensure();
        await redis.ping();
        return true;
      } catch {
        return false;
      }
    },
    close() {
      redis.disconnect();
      return Promise.resolve();
    },
  };
}

export class CachedSnapshotSource implements SnapshotCache {
  readonly enabled: boolean;
  private readonly sf = new Singleflight();
  private readonly circuit: FailureCircuit;
  private lastWarnAt = 0;

  constructor(
    private readonly inner: SnapshotSource,
    private readonly store: CacheStore,
    private readonly metrics: Pick<Metrics, "recordCache" | "recordInvalidationFailure">,
    private readonly log: CacheLogger,
    private readonly now: () => number = Date.now,
    circuit?: FailureCircuit,
  ) {
    this.enabled = store.enabled;
    this.circuit = circuit ?? new FailureCircuit();
  }

  async get(projectId: string, env: string): Promise<CompiledEnvSnapshot | undefined> {
    const key = cacheKey(projectId, env);
    return this.sf.do(key, () => this.loadAndFill(key, projectId, env));
  }

  async invalidateEnvs(projectId: string, envs: readonly string[]): Promise<void> {
    if (!this.store.enabled) return;
    for (const env of envs) {
      try {
        await this.store.del(cacheKey(projectId, env));
        this.circuit.success();
      } catch (err) {
        this.circuit.failure();
        this.metrics.recordInvalidationFailure();
        this.warnDegraded(err);
      }
    }
  }

  ping(): Promise<boolean> {
    if (!this.store.enabled) return Promise.resolve(false);
    if (this.circuit.isOpen) return Promise.resolve(false);
    return this.store.ping().catch(() => false);
  }

  close(): Promise<void> {
    return this.store.close();
  }

  private async readCache(key: string, record: boolean): Promise<CompiledEnvSnapshot | undefined> {
    if (this.circuit.isOpen) {
      if (record) this.metrics.recordCache("error");
      return undefined;
    }
    try {
      const raw = await this.store.get(key);
      this.circuit.success();
      if (raw === null) {
        if (record) {
          this.metrics.recordCache("miss");
          this.log.debug({ cache_key: key }, "cache miss");
        }
        return undefined;
      }
      const snapshot = deserializeSnapshot(raw);
      if (snapshot === undefined) {
        if (record) {
          this.metrics.recordCache("miss");
          this.log.debug({ cache_key: key }, "cache miss");
        }
        return undefined;
      }
      if (record) {
        this.metrics.recordCache("hit");
        this.log.debug({ cache_key: key }, "cache hit");
      }
      return snapshot;
    } catch (err) {
      this.circuit.failure();
      if (record) this.metrics.recordCache("error");
      this.warnDegraded(err);
      return undefined;
    }
  }

  private async loadAndFill(
    key: string,
    projectId: string,
    env: string,
  ): Promise<CompiledEnvSnapshot | undefined> {
    if (this.store.enabled) {
      const cached = await this.readCache(key, true);
      if (cached !== undefined) return cached;
    }
    const snapshot = await this.inner.get(projectId, env);
    if (snapshot !== undefined && this.store.enabled && !this.circuit.isOpen) {
      try {
        await this.store.set(key, serializeSnapshot(snapshot), CACHE_TTL_SECONDS);
        this.circuit.success();
      } catch (err) {
        this.circuit.failure();
        this.warnDegraded(err);
      }
    }
    return snapshot;
  }

  private warnDegraded(err: unknown): void {
    const now = this.now();
    if (now - this.lastWarnAt < REDIS_WARN_INTERVAL_MS) return;
    this.lastWarnAt = now;
    this.log.warn({ err }, "redis unavailable; degrading to postgres");
  }
}

export function createSnapshotCache(opts: {
  readonly redisUrl?: string;
  readonly inner: SnapshotSource;
  readonly metrics: Pick<Metrics, "recordCache" | "recordInvalidationFailure">;
  readonly log: CacheLogger;
  readonly store?: CacheStore;
}): SnapshotCache {
  const store =
    opts.store ??
    (opts.redisUrl !== undefined ? createRedisStore(opts.redisUrl) : disabledCacheStore());
  return new CachedSnapshotSource(opts.inner, store, opts.metrics, opts.log);
}

export function silentCacheLog(): CacheLogger {
  return {
    warn() {},
    debug() {},
  };
}
