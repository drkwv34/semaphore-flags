import type { FastifyInstance } from "fastify";

import type { SnapshotSource } from "../domain/evaluate/index.js";
import { ValidationError } from "../domain/errors.js";
import type { Metrics } from "../metrics/index.js";
import {
  evaluateBatch,
  evaluateFlag,
  type EvaluateBatchRequest,
  type EvaluateRequest,
} from "../services/evaluate.js";
import { requireKey, type ApiKeyFinder } from "./auth.js";
import { UnavailableError } from "./errors.js";
import {
  evaluateBatchBodySchema,
  evaluateBatchResponseSchema,
  evaluateBodySchema,
  evaluateErrorResponses,
  evaluateResponseSchema,
} from "./evaluate-schemas.js";

export function registerEvaluateRoutes(
  app: FastifyInstance,
  deps: { findApiKey: ApiKeyFinder; snapshotSource: SnapshotSource; metrics: Metrics },
): void {
  const evaluateAuth = requireKey(deps.findApiKey, "evaluate");

  app.post<{ Body: EvaluateRequest }>(
    "/v1/evaluate",
    {
      preValidation: evaluateAuth,
      schema: {
        operationId: "evaluateFlag",
        description: "Evaluate a single flag for a user in an environment.",
        body: evaluateBodySchema,
        response: { 200: evaluateResponseSchema, ...evaluateErrorResponses },
      },
    },
    async (request) => {
      const auth = request.auth;
      if (!auth) throw new UnavailableError();
      const started = process.hrtime.bigint();
      try {
        const result = await evaluateFlag(deps.snapshotSource, auth.projectId, request.body);
        const durationSeconds = Number(process.hrtime.bigint() - started) / 1e9;
        deps.metrics.recordEvaluate([result.reason], durationSeconds, "single");
        request.logFields = { flag_key: result.flag_key, reason: result.reason };
        return result;
      } catch (err) {
        if (err instanceof ValidationError) throw err;
        request.log.error({ err }, "evaluate snapshot failed");
        throw new UnavailableError("postgres unreachable");
      }
    },
  );

  app.post<{ Body: EvaluateBatchRequest }>(
    "/v1/evaluate-batch",
    {
      preValidation: evaluateAuth,
      schema: {
        operationId: "evaluateBatch",
        description: "Evaluate up to 50 flag keys for a user in an environment.",
        body: evaluateBatchBodySchema,
        response: { 200: evaluateBatchResponseSchema, ...evaluateErrorResponses },
      },
    },
    async (request) => {
      const auth = request.auth;
      if (!auth) throw new UnavailableError();
      const started = process.hrtime.bigint();
      try {
        const result = await evaluateBatch(deps.snapshotSource, auth.projectId, request.body);
        const durationSeconds = Number(process.hrtime.bigint() - started) / 1e9;
        deps.metrics.recordEvaluate(
          Object.values(result).map((entry) => entry.reason),
          durationSeconds,
          "batch",
        );
        return result;
      } catch (err) {
        if (err instanceof ValidationError) throw err;
        request.log.error({ err }, "evaluate-batch snapshot failed");
        throw new UnavailableError("postgres unreachable");
      }
    },
  );
}
