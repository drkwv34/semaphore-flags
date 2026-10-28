import type { FastifyInstance } from "fastify";

import { listAudit, type AuditListQueryInput } from "../services/audit.js";
import type { Pool } from "../store/index.js";
import { requireKey, type ApiKeyFinder } from "./auth.js";
import { auditErrorResponses, auditListQuerySchema, auditListSchema } from "./audit-schemas.js";
import { UnavailableError } from "./errors.js";

export function registerAuditRoutes(
  app: FastifyInstance,
  deps: { findApiKey: ApiKeyFinder; pool?: Pool },
): void {
  const admin = requireKey(deps.findApiKey, "admin");

  app.get<{ Querystring: AuditListQueryInput }>(
    "/v1/audit",
    {
      preHandler: admin,
      schema: {
        querystring: auditListQuerySchema,
        response: { 200: auditListSchema, ...auditErrorResponses },
      },
    },
    async (request) => {
      const auth = request.auth;
      if (!auth) throw new UnavailableError();
      const pool = deps.pool;
      if (!pool) throw new UnavailableError();
      return listAudit(pool, auth.projectId, request.query);
    },
  );
}
