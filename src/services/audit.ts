import {
  decodeAuditCursor,
  encodeAuditCursor,
  parseAuditAction,
  parseAuditEntityType,
  parseAuditLimit,
  parseIsoTimestamp,
  type AuditAction,
  type AuditEntityType,
} from "../domain/audit.js";
import { listAuditPage, type AuditEvent, type Pool } from "../store/index.js";

export interface AuditListQueryInput {
  readonly entity_type?: string;
  readonly entity_id?: string;
  readonly action?: string;
  readonly since?: string;
  readonly until?: string;
  readonly limit?: number | string;
  readonly cursor?: string;
}

export interface AuditItemJson {
  readonly id: string;
  readonly actor_key_id: string;
  readonly action: AuditAction;
  readonly entity_type: AuditEntityType;
  readonly entity_id: string;
  readonly before_json: unknown;
  readonly after_json: unknown;
  readonly request_id: string;
  readonly created_at: string;
}

export interface AuditListJson {
  readonly items: readonly AuditItemJson[];
  readonly next_cursor: string | null;
}

function toItem(event: AuditEvent): AuditItemJson {
  return {
    id: event.id,
    actor_key_id: event.actorKeyId,
    action: event.action,
    entity_type: event.entityType,
    entity_id: event.entityId,
    before_json: event.beforeJson,
    after_json: event.afterJson,
    request_id: event.requestId,
    created_at: event.createdAt.toISOString(),
  };
}

export async function listAudit(
  pool: Pool,
  projectId: string,
  input: AuditListQueryInput,
): Promise<AuditListJson> {
  const limit = parseAuditLimit(input.limit);
  const entityType =
    input.entity_type === undefined || input.entity_type === ""
      ? undefined
      : parseAuditEntityType(input.entity_type, "/entity_type");
  const action =
    input.action === undefined || input.action === ""
      ? undefined
      : parseAuditAction(input.action, "/action");
  const entityId =
    input.entity_id === undefined || input.entity_id === "" ? undefined : input.entity_id;
  const since =
    input.since === undefined || input.since === ""
      ? undefined
      : parseIsoTimestamp(input.since, "/since");
  const until =
    input.until === undefined || input.until === ""
      ? undefined
      : parseIsoTimestamp(input.until, "/until");
  const cursor =
    input.cursor === undefined || input.cursor === ""
      ? undefined
      : decodeAuditCursor(input.cursor, "/cursor");

  const rows = await listAuditPage(pool, projectId, {
    entityType,
    entityId,
    action,
    since,
    until,
    cursorId: cursor?.id,
    limit: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map(toItem),
    next_cursor: hasMore && last !== undefined ? encodeAuditCursor(last.createdAt, last.id) : null,
  };
}
