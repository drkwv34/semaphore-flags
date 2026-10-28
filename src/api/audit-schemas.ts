import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../domain/audit.js";
import { errorResponses } from "./schemas.js";

export const auditItemSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "actor_key_id",
    "action",
    "entity_type",
    "entity_id",
    "before_json",
    "after_json",
    "request_id",
    "created_at",
  ],
  properties: {
    id: { type: "string" },
    actor_key_id: { type: "string" },
    action: { type: "string", enum: [...AUDIT_ACTIONS] },
    entity_type: { type: "string", enum: [...AUDIT_ENTITY_TYPES] },
    entity_id: { type: "string" },
    before_json: {},
    after_json: {},
    request_id: { type: "string" },
    created_at: { type: "string" },
  },
} as const;

export const auditListSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items", "next_cursor"],
  properties: {
    items: { type: "array", items: auditItemSchema },
    next_cursor: { type: ["string", "null"] },
  },
} as const;

export const auditListQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    entity_type: { type: "string" },
    entity_id: { type: "string" },
    action: { type: "string" },
    since: { type: "string" },
    until: { type: "string" },
    limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
    cursor: { type: "string" },
  },
} as const;

export const auditErrorResponses = errorResponses;
