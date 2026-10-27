/**
 * Pure evaluation algorithm and hash bucketing (SRS FR-EVAL-002). No I/O, no framework imports;
 * operates on compiled snapshot objects handed in by the caller.
 */

import { createHash } from "node:crypto";

import { ValidationError } from "../errors.js";
import { isJsonPrimitive, matchRule, type JsonPrimitive, type RuleOp } from "../rules/index.js";

/** Normative reason enum (SRS FR-EVAL-001). Order and spelling are part of the API contract. */
export const EVALUATION_REASONS = [
  "disabled",
  "rule_match",
  "percentage_in",
  "percentage_out",
  "default",
  "archived",
  "not_found",
] as const;

export type EvaluationReason = (typeof EVALUATION_REASONS)[number];

export type EvalVariant = "on" | "off";

export interface EvalUser {
  readonly id: string;
  readonly attrs?: Readonly<Record<string, JsonPrimitive>>;
}

export interface EvalResult {
  readonly value: boolean;
  readonly reason: EvaluationReason;
  readonly variant: EvalVariant;
}

export interface CompiledRule {
  readonly attribute: string;
  readonly op: RuleOp;
  readonly value: JsonPrimitive | readonly JsonPrimitive[];
  readonly serve: boolean;
}

export interface CompiledFlag {
  readonly key: string;
  readonly archived: boolean;
  readonly defaultValue: boolean;
  readonly enabled: boolean;
  readonly percentage: number;
  readonly rules: readonly CompiledRule[];
}

export interface CompiledEnvSnapshot {
  readonly projectId: string;
  readonly env: string;
  readonly salt: string;
  readonly flags: ReadonlyMap<string, CompiledFlag>;
}

export interface SnapshotFlagInput {
  readonly key: string;
  readonly archived: boolean;
  readonly defaultValue: boolean;
  readonly enabled: boolean;
  readonly percentage: number;
  readonly rules: readonly CompiledRule[];
}

export interface SnapshotSource {
  get(projectId: string, env: string): Promise<CompiledEnvSnapshot | undefined>;
}

const USER_ID_MAX = 128;

export function hashBucket(salt: string, flagKey: string, userId: string): number {
  const digest = createHash("sha256").update(`${salt}:${flagKey}:${userId}`, "utf8").digest();
  return digest.readUInt32BE(0) % 100;
}

export function parseEvalUser(raw: { id?: unknown; attrs?: unknown }, path = "/user"): EvalUser {
  if (typeof raw.id !== "string" || raw.id.length === 0 || raw.id.length > USER_ID_MAX) {
    throw new ValidationError([
      { path: `${path}/id`, message: "must be a string of 1–128 characters" },
    ]);
  }
  if (raw.attrs === undefined) {
    return { id: raw.id };
  }
  if (raw.attrs === null || typeof raw.attrs !== "object" || Array.isArray(raw.attrs)) {
    throw new ValidationError([
      { path: `${path}/attrs`, message: "must be an object of JSON primitives" },
    ]);
  }
  const attrs: Record<string, JsonPrimitive> = {};
  for (const [key, value] of Object.entries(raw.attrs as Record<string, unknown>)) {
    if (!isJsonPrimitive(value)) {
      throw new ValidationError([
        { path: `${path}/attrs/${key}`, message: "must be a JSON primitive" },
      ]);
    }
    attrs[key] = value;
  }
  return { id: raw.id, attrs };
}

export function compileSnapshot(input: {
  readonly projectId: string;
  readonly env: string;
  readonly salt: string;
  readonly flags: readonly SnapshotFlagInput[];
}): CompiledEnvSnapshot {
  const flags = new Map<string, CompiledFlag>();
  for (const flag of input.flags) {
    flags.set(flag.key, {
      key: flag.key,
      archived: flag.archived,
      defaultValue: flag.defaultValue,
      enabled: flag.enabled,
      percentage: flag.percentage,
      rules: flag.rules,
    });
  }
  return {
    projectId: input.projectId,
    env: input.env,
    salt: input.salt,
    flags,
  };
}

function result(value: boolean, reason: EvaluationReason): EvalResult {
  return { value, reason, variant: value ? "on" : "off" };
}

export function evaluate(flag: CompiledFlag | undefined, user: EvalUser, salt: string): EvalResult {
  if (flag === undefined) return result(false, "not_found");
  if (flag.archived) return result(false, "archived");
  if (!flag.enabled) return result(flag.defaultValue, "disabled");
  for (const rule of flag.rules) {
    if (matchRule(rule, user)) return result(rule.serve, "rule_match");
  }
  const bucket = hashBucket(salt, flag.key, user.id);
  if (bucket < flag.percentage) return result(true, "percentage_in");
  return result(false, "percentage_out");
}
