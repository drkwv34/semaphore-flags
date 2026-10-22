import type { Queryable } from "./pool.js";
import { translatePgError } from "./pg-error.js";

export interface Environment {
  readonly id: string;
  readonly projectId: string;
  readonly key: string;
  readonly createdAt: Date;
}

interface EnvironmentRow {
  id: string;
  project_id: string;
  key: string;
  created_at: Date;
}

function toEnvironment(row: EnvironmentRow): Environment {
  return {
    id: row.id,
    projectId: row.project_id,
    key: row.key,
    createdAt: row.created_at,
  };
}

export async function insertEnvironment(
  db: Queryable,
  input: { projectId: string; key: string },
): Promise<Environment> {
  try {
    const res = await db.query<EnvironmentRow>(
      `INSERT INTO environments (project_id, key)
       VALUES ($1, $2)
       RETURNING id, project_id, key, created_at`,
      [input.projectId, input.key],
    );
    const row = res.rows[0];
    if (!row) throw new Error("insert environment returned no row");
    return toEnvironment(row);
  } catch (err) {
    translatePgError(err);
  }
}

export async function ensureEnvironment(
  db: Queryable,
  input: { projectId: string; key: string },
): Promise<void> {
  await db.query(
    `INSERT INTO environments (project_id, key)
     VALUES ($1, $2)
     ON CONFLICT (project_id, key) DO NOTHING`,
    [input.projectId, input.key],
  );
}

export async function listEnvironments(
  db: Queryable,
  projectId: string,
): Promise<readonly Environment[]> {
  const res = await db.query<EnvironmentRow>(
    `SELECT id, project_id, key, created_at FROM environments WHERE project_id = $1 ORDER BY key`,
    [projectId],
  );
  return res.rows.map(toEnvironment);
}
