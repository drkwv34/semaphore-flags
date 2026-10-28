import { ValidationError } from "./errors.js";

export const AUDIT_ACTIONS = [
  "flag.create",
  "flag.update",
  "flag.archive",
  "env_config.update",
  "rule.create",
  "rule.update",
  "rule.delete",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITY_TYPES = ["flag", "env_config", "rule"] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_LIST_DEFAULT_LIMIT = 50;
export const AUDIT_LIST_MAX_LIMIT = 200;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuditCursor {
  readonly createdAt: Date;
  readonly id: string;
}

function isAuditAction(raw: string): raw is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(raw);
}

function isAuditEntityType(raw: string): raw is AuditEntityType {
  return (AUDIT_ENTITY_TYPES as readonly string[]).includes(raw);
}

export function parseAuditAction(raw: string, path = "/action"): AuditAction {
  if (!isAuditAction(raw)) {
    throw new ValidationError([{ path, message: `must be one of ${AUDIT_ACTIONS.join(", ")}` }]);
  }
  return raw;
}

export function parseAuditEntityType(raw: string, path = "/entity_type"): AuditEntityType {
  if (!isAuditEntityType(raw)) {
    throw new ValidationError([
      { path, message: `must be one of ${AUDIT_ENTITY_TYPES.join(", ")}` },
    ]);
  }
  return raw;
}

export function parseIsoTimestamp(raw: string, path: string): Date {
  if (raw.length === 0) {
    throw new ValidationError([{ path, message: "must be an ISO-8601 timestamp" }]);
  }
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) {
    throw new ValidationError([{ path, message: "must be an ISO-8601 timestamp" }]);
  }
  return new Date(ms);
}

export function parseAuditLimit(raw: number | string | undefined, path = "/limit"): number {
  if (raw === undefined || raw === "") return AUDIT_LIST_DEFAULT_LIMIT;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > AUDIT_LIST_MAX_LIMIT) {
    throw new ValidationError([
      { path, message: `must be an integer between 1 and ${String(AUDIT_LIST_MAX_LIMIT)}` },
    ]);
  }
  return parsed;
}

export function encodeAuditCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, "utf8").toString("base64url");
}

export function decodeAuditCursor(raw: string, path = "/cursor"): AuditCursor {
  if (raw.length === 0) {
    throw new ValidationError([{ path, message: "must be a cursor from a previous page" }]);
  }
  let decoded: string;
  try {
    decoded = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    throw new ValidationError([{ path, message: "must be a cursor from a previous page" }]);
  }
  const sep = decoded.lastIndexOf("|");
  if (sep <= 0 || sep === decoded.length - 1) {
    throw new ValidationError([{ path, message: "must be a cursor from a previous page" }]);
  }
  const createdAt = parseIsoTimestamp(decoded.slice(0, sep), path);
  const id = decoded.slice(sep + 1);
  if (!UUID_PATTERN.test(id)) {
    throw new ValidationError([{ path, message: "must be a cursor from a previous page" }]);
  }
  return { createdAt, id };
}
