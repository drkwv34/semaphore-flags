import type { FastifyInstance } from "fastify";

import type { SnapshotSource } from "../domain/evaluate/index.js";
import { ValidationError } from "../domain/errors.js";
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
  deps: { findApiKey: ApiKeyFinder; snapshotSource: SnapshotSource },
): void {
  const evaluateAuth = requireKey(deps.findApiKey, "evaluate");

  app.post<{ Body: EvaluateRequest }>(
    "/v1/evaluate",
    {
      preValidation: evaluateAuth,
      schema: {
        body: evaluateBodySchema,
        response: { 200: evaluateResponseSchema, ...evaluateErrorResponses },
      },
    },
    async (request) => {
      const auth = request.auth;
      if (!auth) throw new UnavailableError();
      try {
        return await evaluateFlag(deps.snapshotSource, auth.projectId, request.body);
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
        body: evaluateBatchBodySchema,
        response: { 200: evaluateBatchResponseSchema, ...evaluateErrorResponses },
      },
    },
    async (request) => {
      const auth = request.auth;
      if (!auth) throw new UnavailableError();
      try {
        return await evaluateBatch(deps.snapshotSource, auth.projectId, request.body);
      } catch (err) {
        if (err instanceof ValidationError) throw err;
        request.log.error({ err }, "evaluate-batch snapshot failed");
        throw new UnavailableError("postgres unreachable");
      }
    },
  );
}
