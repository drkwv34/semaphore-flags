import type { Queryable } from "./pool.js";
import { translatePgError } from "./pg-error.js";

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly salt: string;
  readonly createdAt: Date;
}

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  salt: string;
  created_at: Date;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    salt: row.salt,
    createdAt: row.created_at,
  };
}

export async function insertProject(
  db: Queryable,
  input: { name: string; slug: string; salt: string },
): Promise<Project> {
  try {
    const res = await db.query<ProjectRow>(
      `INSERT INTO projects (name, slug, salt)
       VALUES ($1, $2, $3)
       RETURNING id, name, slug, salt, created_at`,
      [input.name, input.slug, input.salt],
    );
    const row = res.rows[0];
    if (!row) throw new Error("insert project returned no row");
    return toProject(row);
  } catch (err) {
    translatePgError(err);
  }
}

export async function findProjectById(db: Queryable, id: string): Promise<Project | undefined> {
  const res = await db.query<ProjectRow>(
    `SELECT id, name, slug, salt, created_at FROM projects WHERE id = $1`,
    [id],
  );
  const row = res.rows[0];
  return row ? toProject(row) : undefined;
}

export async function findProjectBySlug(db: Queryable, slug: string): Promise<Project | undefined> {
  const res = await db.query<ProjectRow>(
    `SELECT id, name, slug, salt, created_at FROM projects WHERE slug = $1`,
    [slug],
  );
  const row = res.rows[0];
  return row ? toProject(row) : undefined;
}
