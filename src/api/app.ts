import { randomUUID } from "node:crypto";

import Fastify, { type FastifyInstance, LogController } from "fastify";

import type { Config } from "../config.js";
import type { SnapshotSource } from "../domain/evaluate/index.js";
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

export interface AppDeps {
  readonly pool?: Pool;
  readonly redisConfigured?: boolean;
  readonly snapshotSource?: SnapshotSource;
  readonly findApiKey?: ApiKeyFinder;
}

/** Composition root for the HTTP edge. Routes are registered here; they never touch SQL directly. */
export function buildApp(
  config: Pick<Config, "LOG_LEVEL" | "NODE_ENV">,
  deps: AppDeps = {},
): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "test" ? "silent" : config.LOG_LEVEL,
      redact: {
        paths: ["req.headers.authorization", 'req.headers["x-api-key"]'],
        censor: "[redacted]",
      },
    },
    requestIdHeader: REQUEST_ID_HEADER,
    logController: new LogController({ requestIdLogLabel: "request_id" }),
    genReqId: () => randomUUID(),
  });

  app.decorateRequest("auth", null);

  app.addHook("onSend", async (request, reply) => {
    void reply.header(REQUEST_ID_HEADER, request.id);
  });

  app.setErrorHandler(errorHandler);

  app.get("/healthz", () => ({ status: "ok" }));

  app.get("/readyz", async () => {
    if (!deps.pool || !(await pingPostgres(deps.pool))) {
      throw new UnavailableError("postgres unreachable");
    }
    return { status: "ok" };
  });

  app.get("/healthz/deps", async () => {
    const postgres = deps.pool && (await pingPostgres(deps.pool)) ? "ok" : "error";
    const body: { postgres: string; redis: string } = {
      postgres,
      redis: deps.redisConfigured === true ? "not_implemented" : "disabled",
    };
    return body;
  });

  const pool = deps.pool;
  const findApiKey: ApiKeyFinder | undefined =
    deps.findApiKey ??
    (pool === undefined ? undefined : (prefix) => findApiKeyByPrefix(pool, prefix));
  const snapshotSource: SnapshotSource | undefined =
    deps.snapshotSource ?? (pool === undefined ? undefined : postgresSnapshotSource(pool));

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

    registerFlagRoutes(app, pool);
  }

  if (findApiKey !== undefined) {
    registerAuditRoutes(app, pool !== undefined ? { findApiKey, pool } : { findApiKey });
  }

  if (findApiKey !== undefined && snapshotSource !== undefined) {
    registerEvaluateRoutes(app, { findApiKey, snapshotSource });
  }

  return app;
}
