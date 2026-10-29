import { randomUUID } from "node:crypto";

import Fastify, { type FastifyInstance, LogController } from "fastify";

import {
  createSnapshotCache,
  type CacheLogger,
  type CacheStore,
  type SnapshotCache,
} from "../cache/index.js";
import type { Config } from "../config.js";
import type { SnapshotSource } from "../domain/evaluate/index.js";
import { createMetrics, type Metrics } from "../metrics/index.js";
import type { MutationHooks } from "../services/flags.js";
import { createProjectEnvironment, getCurrentProject } from "../services/projects.js";
import {
  findApiKeyByPrefix,
  pingPostgres,
  postgresSnapshotSource,
  type Pool,
} from "../store/index.js";
import { requireKey, type ApiKeyFinder } from "./auth.js";
import { registerAuditRoutes } from "./audit.js";
import { errorHandler, UnavailableError } from "./errors.js";
import { registerEvaluateRoutes } from "./evaluate.js";
import { registerFlagRoutes } from "./flags.js";
import { errorResponses } from "./schemas.js";

export const REQUEST_ID_HEADER = "x-request-id";

const OPS_PROBES = new Set(["/healthz", "/readyz", "/healthz/deps", "/metrics"]);

const statusBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["status"],
  properties: { status: { type: "string" } },
} as const;

const depsBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["postgres", "redis"],
  properties: {
    postgres: { type: "string", enum: ["ok", "degraded"] },
    redis: { type: "string", enum: ["ok", "degraded", "disabled"] },
  },
} as const;

export interface AppDeps {
  readonly pool?: Pool;
  readonly redisUrl?: string;
  readonly redisConfigured?: boolean;
  readonly snapshotSource?: SnapshotSource;
  readonly snapshotCache?: SnapshotCache;
  readonly cacheStore?: CacheStore;
  readonly findApiKey?: ApiKeyFinder;
  readonly metrics?: Metrics;
  readonly logDestination?: { write(chunk: string): void };
}

function isProbe(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  return OPS_PROBES.has(path);
}

/** Composition root for the HTTP edge. Routes are registered here; they never touch SQL directly. */
export function buildApp(
  config: Pick<Config, "LOG_LEVEL" | "NODE_ENV">,
  deps: AppDeps = {},
): FastifyInstance {
  const metrics = deps.metrics ?? createMetrics({ collectDefaults: config.NODE_ENV !== "test" });
  const loggerLevel =
    config.NODE_ENV === "test" && deps.logDestination === undefined ? "silent" : config.LOG_LEVEL;
  const app = Fastify({
    logger: {
      level: loggerLevel,
      redact: {
        paths: ["req.headers.authorization", 'req.headers["x-api-key"]'],
        censor: "[redacted]",
      },
      ...(deps.logDestination !== undefined ? { stream: deps.logDestination } : {}),
    },
    requestIdHeader: REQUEST_ID_HEADER,
    logController: new LogController({
      requestIdLogLabel: "request_id",
      disableRequestLogging: true,
    }),
    genReqId: () => randomUUID(),
  });

  app.decorateRequest("auth", null);
  app.decorateRequest("logFields", undefined);

  const cacheLog: CacheLogger = {
    warn: (obj, msg) => {
      app.log.warn(obj, msg);
    },
    debug: (obj, msg) => {
      app.log.debug(obj, msg);
    },
  };

  const pool = deps.pool;
  const innerSource: SnapshotSource | undefined =
    deps.snapshotSource ?? (pool === undefined ? undefined : postgresSnapshotSource(pool));
  const snapshotCache: SnapshotCache | undefined =
    deps.snapshotCache ??
    (innerSource !== undefined && deps.snapshotSource === undefined
      ? createSnapshotCache({
          ...(deps.redisUrl !== undefined ? { redisUrl: deps.redisUrl } : {}),
          inner: innerSource,
          metrics,
          log: cacheLog,
          ...(deps.cacheStore !== undefined ? { store: deps.cacheStore } : {}),
        })
      : undefined);
  const snapshotSource = snapshotCache ?? innerSource;
  const redisConfigured = snapshotCache?.enabled === true || deps.redisConfigured === true;

  app.addHook("onClose", async () => {
    await snapshotCache?.close();
  });

  app.addHook("onSend", async (request, reply) => {
    void reply.header(REQUEST_ID_HEADER, request.id);
  });

  app.addHook("onResponse", (request, reply, done) => {
    if (isProbe(request.url)) {
      done();
      return;
    }
    const fields: Record<string, unknown> = {
      project_id: request.auth?.projectId,
      duration_ms: Math.round(reply.elapsedTime),
    };
    if (request.logFields?.flag_key !== undefined) fields.flag_key = request.logFields.flag_key;
    if (request.logFields?.reason !== undefined) fields.reason = request.logFields.reason;
    request.log.info(fields, "request completed");
    done();
  });

  app.setErrorHandler(errorHandler);

  app.get("/healthz", { schema: { response: { 200: statusBodySchema } } }, () => ({
    status: "ok",
  }));

  app.get(
    "/readyz",
    { schema: { response: { 200: statusBodySchema, ...errorResponses } } },
    async () => {
      if (!deps.pool || !(await pingPostgres(deps.pool))) {
        throw new UnavailableError("postgres unreachable");
      }
      return { status: "ok" };
    },
  );

  app.get("/healthz/deps", { schema: { response: { 200: depsBodySchema } } }, async () => {
    const postgres = deps.pool && (await pingPostgres(deps.pool)) ? "ok" : "degraded";
    let redis: "ok" | "degraded" | "disabled" = "disabled";
    if (redisConfigured) {
      redis = snapshotCache !== undefined && (await snapshotCache.ping()) ? "ok" : "degraded";
    }
    return { postgres, redis };
  });

  app.get("/metrics", async (_request, reply) => {
    const body = await metrics.metricsText();
    return reply.type(metrics.contentType).send(body);
  });

  const findApiKey: ApiKeyFinder | undefined =
    deps.findApiKey ??
    (pool === undefined ? undefined : (prefix) => findApiKeyByPrefix(pool, prefix));

  const mutationHooks: MutationHooks = {
    invalidateEnvs: async (projectId, envs) => {
      await snapshotCache?.invalidateEnvs(projectId, envs);
    },
    recordMutation: (action) => {
      metrics.recordAdminMutation(action);
    },
  };

  if (pool && findApiKey) {
    app.get(
      "/v1/projects/current",
      {
        preHandler: requireKey(findApiKey, "admin"),
        schema: {
          response: {
            200: {
              type: "object",
              additionalProperties: false,
              required: ["id", "name", "slug", "created_at"],
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                slug: { type: "string" },
                created_at: { type: "string" },
              },
            },
            ...errorResponses,
          },
        },
      },
      async (request) => {
        const auth = request.auth;
        if (!auth) throw new UnavailableError();
        const project = await getCurrentProject(pool, auth.projectId);
        return {
          id: project.id,
          name: project.name,
          slug: project.slug,
          created_at: project.createdAt.toISOString(),
        };
      },
    );

    app.post<{ Body: { key: string } }>(
      "/v1/environments",
      {
        preHandler: requireKey(findApiKey, "admin"),
        schema: {
          body: {
            type: "object",
            additionalProperties: false,
            required: ["key"],
            properties: {
              key: { type: "string" },
            },
          },
          response: {
            201: {
              type: "object",
              additionalProperties: false,
              required: ["id", "key", "created_at"],
              properties: {
                id: { type: "string" },
                key: { type: "string" },
                created_at: { type: "string" },
              },
            },
            ...errorResponses,
          },
        },
      },
      async (request, reply) => {
        const auth = request.auth;
        if (!auth) throw new UnavailableError();
        const env = await createProjectEnvironment(pool, auth.projectId, request.body.key);
        void reply.code(201);
        return {
          id: env.id,
          key: env.key,
          created_at: env.createdAt.toISOString(),
        };
      },
    );

    registerFlagRoutes(app, pool, mutationHooks);
  }

  if (findApiKey !== undefined) {
    registerAuditRoutes(app, pool !== undefined ? { findApiKey, pool } : { findApiKey });
  }

  if (findApiKey !== undefined && snapshotSource !== undefined) {
    registerEvaluateRoutes(app, { findApiKey, snapshotSource, metrics });
  }

  return app;
}
