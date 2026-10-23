import type { FastifyInstance } from "fastify";

import {
  archiveFlag,
  createFlag,
  getFlag,
  listFlags,
  patchFlag,
  putEnvConfig,
  type CreateFlagInput,
  type PatchFlagInput,
  type PutEnvConfigInput,
} from "../services/flags.js";
import type { Pool } from "../store/index.js";
import { requireKey } from "./auth.js";
import { UnavailableError } from "./errors.js";
import {
  createFlagBodySchema,
  flagDetailSchema,
  flagEnvParamsSchema,
  flagErrorResponses,
  flagKeyParamsSchema,
  flagListSchema,
  listFlagsQuerySchema,
  patchFlagBodySchema,
  putEnvBodySchema,
  envConfigSchema,
} from "./flag-schemas.js";

interface FlagKeyParams {
  key: string;
}

interface FlagEnvParams {
  key: string;
  env: string;
}

interface ListFlagsQuery {
  include_archived?: boolean | string;
  limit?: number | string;
  offset?: number | string;
}

function queryBool(value: boolean | string | undefined): boolean {
  return value === true || value === "true";
}

function queryInt(value: number | string | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value !== "") {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) return parsed;
  }
  return fallback;
}

export function registerFlagRoutes(app: FastifyInstance, pool: Pool): void {
  const admin = requireKey(pool, "admin");

  app.post<{ Body: CreateFlagInput }>(
    "/v1/flags",
    {
      preHandler: admin,
      schema: {
        body: createFlagBodySchema,
        response: { 201: flagDetailSchema, ...flagErrorResponses },
      },
    },
    async (request, reply) => {
      const auth = request.auth;
      if (!auth) throw new UnavailableError();
      const flag = await createFlag(
        pool,
        { projectId: auth.projectId, actorKeyId: auth.keyId, requestId: request.id },
        request.body,
      );
      void reply.code(201);
      return flag;
    },
  );

  app.get<{ Querystring: ListFlagsQuery }>(
    "/v1/flags",
    {
      preHandler: admin,
      schema: {
        querystring: listFlagsQuerySchema,
        response: { 200: flagListSchema, ...flagErrorResponses },
      },
    },
    async (request) => {
      const auth = request.auth;
      if (!auth) throw new UnavailableError();
      const limit = Math.min(200, Math.max(1, queryInt(request.query.limit, 50)));
      const offset = Math.max(0, queryInt(request.query.offset, 0));
      return listFlags(pool, auth.projectId, {
        includeArchived: queryBool(request.query.include_archived),
        limit,
        offset,
      });
    },
  );

  app.get<{ Params: FlagKeyParams }>(
    "/v1/flags/:key",
    {
      preHandler: admin,
      schema: {
        params: flagKeyParamsSchema,
        response: { 200: flagDetailSchema, ...flagErrorResponses },
      },
    },
    async (request) => {
      const auth = request.auth;
      if (!auth) throw new UnavailableError();
      return getFlag(pool, auth.projectId, request.params.key);
    },
  );

  app.patch<{ Params: FlagKeyParams; Body: PatchFlagInput }>(
    "/v1/flags/:key",
    {
      preHandler: admin,
      schema: {
        params: flagKeyParamsSchema,
        body: patchFlagBodySchema,
        response: { 200: flagDetailSchema, ...flagErrorResponses },
      },
    },
    async (request) => {
      const auth = request.auth;
      if (!auth) throw new UnavailableError();
      return patchFlag(
        pool,
        { projectId: auth.projectId, actorKeyId: auth.keyId, requestId: request.id },
        request.params.key,
        request.body,
      );
    },
  );

  app.put<{ Params: FlagEnvParams; Body: PutEnvConfigInput }>(
    "/v1/flags/:key/envs/:env",
    {
      preHandler: admin,
      schema: {
        params: flagEnvParamsSchema,
        body: putEnvBodySchema,
        response: { 200: envConfigSchema, ...flagErrorResponses },
      },
    },
    async (request) => {
      const auth = request.auth;
      if (!auth) throw new UnavailableError();
      return putEnvConfig(
        pool,
        { projectId: auth.projectId, actorKeyId: auth.keyId, requestId: request.id },
        request.params.key,
        request.params.env,
        request.body,
      );
    },
  );

  app.post<{ Params: FlagKeyParams }>(
    "/v1/flags/:key/archive",
    {
      preHandler: admin,
      schema: {
        params: flagKeyParamsSchema,
        response: { 200: flagDetailSchema, ...flagErrorResponses },
      },
    },
    async (request) => {
      const auth = request.auth;
      if (!auth) throw new UnavailableError();
      return archiveFlag(
        pool,
        { projectId: auth.projectId, actorKeyId: auth.keyId, requestId: request.id },
        request.params.key,
      );
    },
  );
}
