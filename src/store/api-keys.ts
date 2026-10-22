import type { ApiKeyType } from "../domain/api-key.js";
import type { Queryable } from "./pool.js";
import { translatePgError } from "./pg-error.js";

export interface ApiKeyRecord {
  readonly id: string;
  readonly projectId: string;
  readonly type: ApiKeyType;
  readonly prefix: string;
  readonly keyHash: string;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
}

interface ApiKeyRow {
  id: string;
  project_id: string;
  type: ApiKeyType;
  prefix: string;
  key_hash: string;
  created_at: Date;
  revoked_at: Date | null;
}

function toRecord(row: ApiKeyRow): ApiKeyRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    prefix: row.prefix,
    keyHash: row.key_hash,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}

export async function insertApiKey(
  db: Queryable,
  input: { projectId: string; type: ApiKeyType; prefix: string; keyHash: string },
): Promise<ApiKeyRecord> {
  try {
    const res = await db.query<ApiKeyRow>(
      `INSERT INTO api_keys (project_id, type, prefix, key_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, project_id, type, prefix, key_hash, created_at, revoked_at`,
      [input.projectId, input.type, input.prefix, input.keyHash],
    );
    const row = res.rows[0];
    if (!row) throw new Error("insert api_key returned no row");
    return toRecord(row);
  } catch (err) {
    translatePgError(err);
  }
}

export async function findApiKeyByPrefix(
  db: Queryable,
  prefix: string,
): Promise<ApiKeyRecord | undefined> {
  const res = await db.query<ApiKeyRow>(
    `SELECT id, project_id, type, prefix, key_hash, created_at, revoked_at
     FROM api_keys WHERE prefix = $1`,
    [prefix],
  );
  const row = res.rows[0];
  return row ? toRecord(row) : undefined;
}

export async function listApiKeysByProject(
  db: Queryable,
  projectId: string,
): Promise<readonly ApiKeyRecord[]> {
  const res = await db.query<ApiKeyRow>(
    `SELECT id, project_id, type, prefix, key_hash, created_at, revoked_at
     FROM api_keys WHERE project_id = $1`,
    [projectId],
  );
  return res.rows.map(toRecord);
}

export async function revokeApiKey(db: Queryable, id: string): Promise<void> {
  await db.query(`UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [
    id,
  ]);
}
