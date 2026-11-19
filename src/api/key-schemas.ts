import { API_KEY_TYPES } from "../domain/api-key.js";
import { errorResponses } from "./schemas.js";

export const keyMetadataSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "type", "prefix", "created_at", "revoked_at"],
  properties: {
    id: { type: "string" },
    type: { type: "string", enum: [...API_KEY_TYPES] },
    prefix: { type: "string" },
    created_at: { type: "string" },
    revoked_at: { type: ["string", "null"] },
  },
} as const;

export const keyListSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: { type: "array", items: keyMetadataSchema },
  },
} as const;

export const keyIdParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id"],
  properties: {
    id: { type: "string" },
  },
} as const;

export const keyErrorResponses = errorResponses;
