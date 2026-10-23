import { errorResponses } from "./schemas.js";

export const ruleSchema = {
  type: "object",
  additionalProperties: false,
  required: ["priority", "attribute", "op", "value", "serve"],
  properties: {
    id: { type: "string" },
    priority: { type: "integer" },
    attribute: { type: "string" },
    op: { type: "string" },
    value: {},
    serve: { type: "boolean" },
  },
} as const;

export const envConfigSchema = {
  type: "object",
  additionalProperties: false,
  required: ["key", "enabled", "percentage", "updated_at", "rules"],
  properties: {
    key: { type: "string" },
    enabled: { type: "boolean" },
    percentage: { type: "integer" },
    updated_at: { type: "string" },
    rules: { type: "array", items: ruleSchema },
  },
} as const;

export const flagSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "key",
    "description",
    "flag_type",
    "default_value",
    "client_fallback",
    "archived_at",
    "created_at",
    "updated_at",
  ],
  properties: {
    id: { type: "string" },
    key: { type: "string" },
    description: { type: "string" },
    flag_type: { type: "string" },
    default_value: { type: "boolean" },
    client_fallback: { type: "string" },
    archived_at: { type: ["string", "null"] },
    created_at: { type: "string" },
    updated_at: { type: "string" },
  },
} as const;

export const flagDetailSchema = {
  type: "object",
  additionalProperties: false,
  required: [...flagSchema.required, "envs"],
  properties: {
    ...flagSchema.properties,
    envs: { type: "array", items: envConfigSchema },
  },
} as const;

export const flagListSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items", "limit", "offset"],
  properties: {
    items: { type: "array", items: flagSchema },
    limit: { type: "integer" },
    offset: { type: "integer" },
  },
} as const;

export const createFlagBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["key", "default_value"],
  properties: {
    key: { type: "string" },
    description: { type: "string" },
    default_value: { type: "boolean" },
    client_fallback: { type: "string" },
  },
} as const;

export const patchFlagBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    description: { type: "string" },
    default_value: { type: "boolean" },
    client_fallback: { type: "string" },
  },
} as const;

export const putEnvBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["enabled", "percentage", "rules"],
  properties: {
    enabled: { type: "boolean" },
    percentage: { type: "integer" },
    rules: { type: "array", items: ruleSchema },
  },
} as const;

export const flagKeyParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["key"],
  properties: {
    key: { type: "string" },
  },
} as const;

export const flagEnvParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["key", "env"],
  properties: {
    key: { type: "string" },
    env: { type: "string" },
  },
} as const;

export const listFlagsQuerySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    include_archived: { type: "boolean" },
    limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
    offset: { type: "integer", minimum: 0, default: 0 },
  },
} as const;

export const flagErrorResponses = errorResponses;
