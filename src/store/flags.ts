import type { ClientFallback, FlagType } from "../domain/flag.js";
import type { Queryable } from "./pool.js";
import { translatePgError } from "./pg-error.js";

export interface Flag {
  readonly id: string;
  readonly projectId: string;
  readonly key: string;
  readonly description: string;
  readonly flagType: FlagType;
  readonly defaultValue: boolean;
  readonly clientFallback: ClientFallback;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface FlagRow {
  id: string;
  project_id: string;
  key: string;
  description: string;
  flag_type: FlagType;
  default_value: boolean;
  client_fallback: ClientFallback;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function toFlag(row: FlagRow): Flag {
  return {
    id: row.id,
    projectId: row.project_id,
    key: row.key,
    description: row.description,
    flagType: row.flag_type,
    defaultValue: row.default_value,
    clientFallback: row.client_fallback,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const FLAG_COLS = `id, project_id, key, description, flag_type, default_value, client_fallback,
       archived_at, created_at, updated_at`;

export async function insertFlag(
  db: Queryable,
  input: {
    projectId: string;
    key: string;
    description: string;
    defaultValue: boolean;
    clientFallback: ClientFallback;
  },
): Promise<Flag> {
  try {
    const res = await db.query<FlagRow>(
      `INSERT INTO flags (project_id, key, description, flag_type, default_value, client_fallback)
       VALUES ($1, $2, $3, 'boolean', $4, $5)
       RETURNING ${FLAG_COLS}`,
      [input.projectId, input.key, input.description, input.defaultValue, input.clientFallback],
    );
    const row = res.rows[0];
    if (!row) throw new Error("insert flag returned no row");
    return toFlag(row);
  } catch (err) {
    translatePgError(err);
  }
}

export async function lockFlagByKey(
  db: Queryable,
  projectId: string,
  key: string,
): Promise<Flag | undefined> {
  const res = await db.query<FlagRow>(
    `SELECT ${FLAG_COLS} FROM flags WHERE project_id = $1 AND key = $2 FOR UPDATE`,
    [projectId, key],
  );
  const row = res.rows[0];
  return row ? toFlag(row) : undefined;
}

export async function findFlagByKey(
  db: Queryable,
  projectId: string,
  key: string,
): Promise<Flag | undefined> {
  const res = await db.query<FlagRow>(
    `SELECT ${FLAG_COLS} FROM flags WHERE project_id = $1 AND key = $2`,
    [projectId, key],
  );
  const row = res.rows[0];
  return row ? toFlag(row) : undefined;
}

export async function listFlags(
  db: Queryable,
  input: {
    projectId: string;
    includeArchived: boolean;
    limit: number;
    offset: number;
  },
): Promise<readonly Flag[]> {
  const res = await db.query<FlagRow>(
    `SELECT ${FLAG_COLS} FROM flags
     WHERE project_id = $1 AND ($2::boolean OR archived_at IS NULL)
     ORDER BY key
     LIMIT $3 OFFSET $4`,
    [input.projectId, input.includeArchived, input.limit, input.offset],
  );
  return res.rows.map(toFlag);
}

export async function updateFlag(
  db: Queryable,
  input: {
    id: string;
    description: string;
    defaultValue: boolean;
    clientFallback: ClientFallback;
  },
): Promise<Flag> {
  const res = await db.query<FlagRow>(
    `UPDATE flags
     SET description = $2, default_value = $3, client_fallback = $4, updated_at = now()
     WHERE id = $1
     RETURNING ${FLAG_COLS}`,
    [input.id, input.description, input.defaultValue, input.clientFallback],
  );
  const row = res.rows[0];
  if (!row) throw new Error("update flag returned no row");
  return toFlag(row);
}

export async function archiveFlag(db: Queryable, id: string): Promise<Flag> {
  const res = await db.query<FlagRow>(
    `UPDATE flags SET archived_at = now(), updated_at = now() WHERE id = $1 AND archived_at IS NULL
     RETURNING ${FLAG_COLS}`,
    [id],
  );
  const row = res.rows[0];
  if (!row) throw new Error("archive flag returned no row");
  return toFlag(row);
}
