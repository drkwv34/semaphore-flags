import type { AuditAction, AuditEntityType } from "../domain/audit.js";
import { ValidationError } from "../domain/errors.js";
import type { Queryable } from "./pool.js";
import { translatePgError } from "./pg-error.js";

export interface AuditEvent {
  readonly id: string;
  readonly projectId: string;
  readonly actorKeyId: string;
  readonly action: AuditAction;
  readonly entityType: AuditEntityType;
  readonly entityId: string;
  readonly beforeJson: unknown;
  readonly afterJson: unknown;
  readonly createdAt: Date;
  readonly requestId: string;
}

interface AuditRow {
  id: string;
  project_id: string;
  actor_key_id: string;
  action: AuditAction;
  entity_type: AuditEntityType;
  entity_id: string;
  before_json: unknown;
  after_json: unknown;
  created_at: Date;
  request_id: string;
}

function toEvent(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    actorKeyId: row.actor_key_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    beforeJson: row.before_json,
    afterJson: row.after_json,
    createdAt: row.created_at,
    requestId: row.request_id,
  };
}

export async function insertAuditEvent(
  db: Queryable,
  input: {
    projectId: string;
    actorKeyId: string;
    action: AuditAction;
    entityType: AuditEntityType;
    entityId: string;
    beforeJson: unknown;
    afterJson: unknown;
    requestId: string;
  },
): Promise<AuditEvent> {
  try {
    const res = await db.query<AuditRow>(
      `INSERT INTO audit_events (
         project_id, actor_key_id, action, entity_type, entity_id, before_json, after_json, request_id
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
       RETURNING id, project_id, actor_key_id, action, entity_type, entity_id,
                 before_json, after_json, created_at, request_id`,
      [
        input.projectId,
        input.actorKeyId,
        input.action,
        input.entityType,
        input.entityId,
        input.beforeJson === null ? null : JSON.stringify(input.beforeJson),
        input.afterJson === null ? null : JSON.stringify(input.afterJson),
        input.requestId,
      ],
    );
    const row = res.rows[0];
    if (!row) throw new Error("insert audit_event returned no row");
    return toEvent(row);
  } catch (err) {
    translatePgError(err);
  }
}

export async function listAuditEvents(
  db: Queryable,
  projectId: string,
): Promise<readonly AuditEvent[]> {
  const res = await db.query<AuditRow>(
    `SELECT id, project_id, actor_key_id, action, entity_type, entity_id,
            before_json, after_json, created_at, request_id
     FROM audit_events WHERE project_id = $1
     ORDER BY created_at, id`,
    [projectId],
  );
  return res.rows.map(toEvent);
}

export interface AuditPageQuery {
  readonly entityType?: AuditEntityType | undefined;
  readonly entityId?: string | undefined;
  readonly action?: AuditAction | undefined;
  readonly since?: Date | undefined;
  readonly until?: Date | undefined;
  readonly cursorId?: string | undefined;
  readonly limit: number;
}

export async function listAuditPage(
  db: Queryable,
  projectId: string,
  query: AuditPageQuery,
): Promise<readonly AuditEvent[]> {
  if (query.cursorId !== undefined) {
    const found = await db.query<{ id: string }>(
      `SELECT id FROM audit_events WHERE id = $1 AND project_id = $2`,
      [query.cursorId, projectId],
    );
    if (found.rows[0] === undefined) {
      throw new ValidationError([
        { path: "/cursor", message: "must be a cursor from a previous page" },
      ]);
    }
  }

  const res = await db.query<AuditRow>(
    `SELECT id, project_id, actor_key_id, action, entity_type, entity_id,
            before_json, after_json, created_at, request_id
     FROM audit_events
     WHERE project_id = $1
       AND ($2::text IS NULL OR entity_type = $2)
       AND ($3::text IS NULL OR entity_id = $3)
       AND ($4::text IS NULL OR action = $4)
       AND ($5::timestamptz IS NULL OR created_at >= $5)
       AND ($6::timestamptz IS NULL OR created_at < ($6::timestamptz + interval '1 millisecond'))
       AND (
         $7::uuid IS NULL
         OR (created_at, id) < (
           SELECT a.created_at, a.id FROM audit_events a
           WHERE a.id = $7 AND a.project_id = $1
         )
       )
     ORDER BY created_at DESC, id DESC
     LIMIT $8`,
    [
      projectId,
      query.entityType ?? null,
      query.entityId ?? null,
      query.action ?? null,
      query.since ?? null,
      query.until ?? null,
      query.cursorId ?? null,
      query.limit,
    ],
  );
  return res.rows.map(toEvent);
}
