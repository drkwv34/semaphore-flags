import { EVALUATION_REASONS } from "../domain/evaluate/index.js";
import { errorResponses } from "./schemas.js";

export const evaluateBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["flag_key", "env", "user"],
  properties: {
    flag_key: { type: "string" },
    env: { type: "string" },
    user: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string", minLength: 1, maxLength: 128 },
        attrs: {
          type: "object",
          additionalProperties: {
            anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "null" }],
          },
        },
      },
    },
  },
} as const;

export const evaluateResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["flag_key", "value", "reason", "variant"],
  properties: {
    flag_key: { type: "string" },
    value: { type: "boolean" },
    reason: { type: "string", enum: [...EVALUATION_REASONS] },
    variant: { type: "string", enum: ["on", "off"] },
  },
} as const;

export const evaluateErrorResponses = errorResponses;

export const evaluateBatchBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["env", "user", "flag_keys"],
  properties: {
    env: { type: "string" },
    user: {
      type: "object",
      additionalProperties: false,
      required: ["id"],
      properties: {
        id: { type: "string", minLength: 1, maxLength: 128 },
        attrs: {
          type: "object",
          additionalProperties: {
            anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }, { type: "null" }],
          },
        },
      },
    },
    flag_keys: {
      type: "array",
      minItems: 1,
      maxItems: 50,
      items: { type: "string" },
    },
  },
} as const;

export const evaluateBatchResponseSchema = {
  type: "object",
  additionalProperties: evaluateResponseSchema,
} as const;
