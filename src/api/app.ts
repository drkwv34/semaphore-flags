import { randomUUID } from "node:crypto";

import Fastify, { type FastifyInstance, LogController } from "fastify";

import type { Config } from "../config.js";
import { createProjectEnvironment, getCurrentProject } from "../services/projects.js";
import { pingPostgres, type Pool } from "../store/index.js";
import { requireKey } from "./auth.js";
import { errorHandler, NotImplementedError, UnavailableError } from "./errors.js";
import { errorResponses } from "./schemas.js";

export const REQUEST_ID_HEADER = "x-request-id";

export interface AppDeps {
  readonly pool?: Pool;
  readonly redisConfigured?: boolean;
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

  if (pool) {
    app.get(
      "/v1/projects/current",
      {
        preHandler: requireKey(pool, "admin"),
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
        preHandler: requireKey(pool, "admin"),
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

    app.post(
      "/v1/evaluate",
      {
        preHandler: requireKey(pool, "evaluate"),
        schema: {
          response: {
            ...errorResponses,
          },
        },
      },
      () => {
        throw new NotImplementedError("evaluate is not implemented");
      },
    );
  }

  return app;
}
