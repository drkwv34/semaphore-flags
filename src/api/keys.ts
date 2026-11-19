import type { FastifyInstance } from "fastify";

import { listProjectApiKeys, revokeProjectApiKey } from "../services/api-keys.js";
import type { MutationHooks } from "../services/flags.js";
import type { Pool } from "../store/index.js";
import { requireKey, type ApiKeyFinder } from "./auth.js";
import { UnavailableError } from "./errors.js";
import {
  keyErrorResponses,
  keyIdParamsSchema,
  keyListSchema,
  keyMetadataSchema,
} from "./key-schemas.js";

interface KeyIdParams {
  id: string;
}

export function registerKeyRoutes(
  app: FastifyInstance,
  deps: { findApiKey: ApiKeyFinder; pool?: Pool; hooks?: MutationHooks },
): void {
  const admin = requireKey(deps.findApiKey, "admin");

  app.get(
    "/v1/keys",
    {
      preHandler: admin,
      schema: {
        operationId: "listKeys",
        description:
          "List API key metadata for the authenticated project. Never returns raw secrets or hashes.",
        response: { 200: keyListSchema, ...keyErrorResponses },
      },
    },
    async (request) => {
      const auth = request.auth;
      if (!auth) throw new UnavailableError();
      const pool = deps.pool;
      if (!pool) throw new UnavailableError();
      return listProjectApiKeys(pool, auth.projectId);
    },
  );

  app.post<{ Params: KeyIdParams }>(
    "/v1/keys/:id/revoke",
    {
      preHandler: admin,
      schema: {
        operationId: "revokeKey",
        description:
          "Revoke an API key in the authenticated project. Idempotent. Self-revoke ends access after 200.",
        params: keyIdParamsSchema,
        response: { 200: keyMetadataSchema, ...keyErrorResponses },
      },
    },
    async (request) => {
      const auth = request.auth;
      if (!auth) throw new UnavailableError();
      const pool = deps.pool;
      if (!pool) throw new UnavailableError();
      return revokeProjectApiKey(
        pool,
        { projectId: auth.projectId, actorKeyId: auth.keyId, requestId: request.id },
        request.params.id,
        deps.hooks,
      );
    },
  );
}
