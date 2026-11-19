import { randomBytes } from "node:crypto";

import { hashApiKey, parseKeyId, type ApiKeyType } from "../domain/api-key.js";
import { NotFoundError } from "../domain/errors.js";
import { parseProjectSlug } from "../domain/project.js";
import {
  findProjectBySlug,
  insertApiKey,
  insertAuditEvent,
  listApiKeysByProject,
  lockApiKeyForProject,
  revokeApiKey,
  withTx,
  type ApiKeyRecord,
  type Pool,
  type Queryable,
} from "../store/index.js";

export interface KeyMutationHooks {
  readonly recordMutation?: (action: string) => void;
}

export interface MintedApiKey {
  readonly type: ApiKeyType;
  readonly raw: string;
  readonly prefix: string;
  readonly keyHash: string;
}

export interface KeyMetadataJson {
  readonly id: string;
  readonly type: ApiKeyType;
  readonly prefix: string;
  readonly created_at: string;
  readonly revoked_at: string | null;
}

export interface KeyListJson {
  readonly items: readonly KeyMetadataJson[];
}

export interface KeyMutationContext {
  readonly projectId: string;
  readonly actorKeyId: string | null;
  readonly requestId: string;
}

export function mintApiKey(type: ApiKeyType): MintedApiKey {
  const label = type === "admin" ? "admin" : "eval";
  const shortId = randomBytes(4).toString("hex");
  const secret = randomBytes(32).toString("hex");
  const prefix = `sf_${label}_${shortId}`;
  const raw = `${prefix}_${secret}`;
  return { type, raw, prefix, keyHash: hashApiKey(raw) };
}

export function toKeyMetadata(record: ApiKeyRecord): KeyMetadataJson {
  return {
    id: record.id,
    type: record.type,
    prefix: record.prefix,
    created_at: record.createdAt.toISOString(),
    revoked_at: record.revokedAt === null ? null : record.revokedAt.toISOString(),
  };
}

export async function persistMintedKey(
  tx: Queryable,
  projectId: string,
  minted: MintedApiKey,
  requestId: string,
): Promise<ApiKeyRecord> {
  const row = await insertApiKey(tx, {
    projectId,
    type: minted.type,
    prefix: minted.prefix,
    keyHash: minted.keyHash,
  });
  await insertAuditEvent(tx, {
    projectId,
    actorKeyId: null,
    action: "key.create",
    entityType: "key",
    entityId: row.id,
    beforeJson: null,
    afterJson: toKeyMetadata(row),
    requestId,
  });
  return row;
}

export async function listProjectApiKeys(pool: Pool, projectId: string): Promise<KeyListJson> {
  const rows = await listApiKeysByProject(pool, projectId);
  return { items: rows.map(toKeyMetadata) };
}

export async function listKeysByProjectSlug(pool: Pool, slug: string): Promise<KeyListJson> {
  const project = await findProjectBySlug(pool, parseProjectSlug(slug));
  if (!project) throw new NotFoundError("project", slug);
  return listProjectApiKeys(pool, project.id);
}

export async function revokeProjectApiKey(
  pool: Pool,
  ctx: KeyMutationContext,
  rawId: string,
  hooks?: KeyMutationHooks,
): Promise<KeyMetadataJson> {
  const keyId = parseKeyId(rawId);
  const result = await withTx(pool, async (tx) => {
    const row = await lockApiKeyForProject(tx, ctx.projectId, keyId);
    if (row === undefined) throw new NotFoundError("key", keyId);
    if (row.revokedAt !== null) return { metadata: toKeyMetadata(row), mutated: false };
    const revoked = await revokeApiKey(tx, row.id);
    if (revoked === undefined) {
      const again = await lockApiKeyForProject(tx, ctx.projectId, keyId);
      if (again === undefined) throw new NotFoundError("key", keyId);
      return { metadata: toKeyMetadata(again), mutated: false };
    }
    await insertAuditEvent(tx, {
      projectId: ctx.projectId,
      actorKeyId: ctx.actorKeyId,
      action: "key.revoke",
      entityType: "key",
      entityId: revoked.id,
      beforeJson: toKeyMetadata(row),
      afterJson: toKeyMetadata(revoked),
      requestId: ctx.requestId,
    });
    return { metadata: toKeyMetadata(revoked), mutated: true };
  });
  if (result.mutated) hooks?.recordMutation?.("key.revoke");
  return result.metadata;
}

export async function revokeKeyByProjectSlug(
  pool: Pool,
  slug: string,
  keyId: string,
  requestId: string,
): Promise<KeyMetadataJson> {
  const project = await findProjectBySlug(pool, parseProjectSlug(slug));
  if (!project) throw new NotFoundError("project", slug);
  return revokeProjectApiKey(pool, { projectId: project.id, actorKeyId: null, requestId }, keyId);
}
