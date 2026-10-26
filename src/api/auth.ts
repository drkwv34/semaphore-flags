import type { FastifyRequest } from "fastify";

import { DUMMY_KEY_HASH, hashApiKey, hashesMatch, parseApiKey } from "../domain/api-key.js";
import type { ApiKeyType } from "../domain/api-key.js";
import type { ApiKeyRecord } from "../store/index.js";
import { UnauthorizedError, ForbiddenError } from "./errors.js";

export interface AuthContext {
  readonly projectId: string;
  readonly keyType: ApiKeyType;
  readonly keyId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export type ApiKeyFinder = (prefix: string) => Promise<ApiKeyRecord | undefined>;

const BEARER = /^Bearer\s+(\S+)$/i;

function presentedToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (typeof header !== "string") return undefined;
  const match = BEARER.exec(header);
  return match?.[1];
}

export function requireKey(find: ApiKeyFinder, required: ApiKeyType) {
  return async (request: FastifyRequest): Promise<void> => {
    const raw = presentedToken(request);
    if (raw === undefined) {
      throw new UnauthorizedError();
    }

    const parsed = parseApiKey(raw);
    const presentedHash = hashApiKey(raw);
    if (parsed === undefined) {
      void hashesMatch(DUMMY_KEY_HASH, presentedHash);
      throw new UnauthorizedError();
    }

    const row = await find(parsed.prefix);
    const storedHash = row?.keyHash ?? DUMMY_KEY_HASH;
    if (!hashesMatch(storedHash, presentedHash) || row === undefined || row.revokedAt !== null) {
      throw new UnauthorizedError();
    }
    if (row.type !== required) {
      throw new ForbiddenError();
    }

    request.auth = { projectId: row.projectId, keyType: row.type, keyId: row.id };
  };
}
