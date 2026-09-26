import { randomUUID } from "node:crypto";

import Fastify, { type FastifyInstance, LogController } from "fastify";

import type { Config } from "../config.js";
import { errorHandler } from "./errors.js";

export const REQUEST_ID_HEADER = "x-request-id";

/** Composition root for the HTTP edge. Routes are registered here; they never touch SQL directly. */
export function buildApp(config: Pick<Config, "LOG_LEVEL" | "NODE_ENV">): FastifyInstance {
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

  app.addHook("onSend", async (request, reply) => {
    void reply.header(REQUEST_ID_HEADER, request.id);
  });

  app.setErrorHandler(errorHandler);

  app.get("/healthz", () => ({ status: "ok" }));

  return app;
}
