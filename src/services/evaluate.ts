import {
  evaluate,
  parseEvalUser,
  type EvalResult,
  type SnapshotSource,
} from "../domain/evaluate/index.js";
import { parseEnvKey } from "../domain/env-key.js";
import { ValidationError } from "../domain/errors.js";
import { parseFlagKey, type FlagKey } from "../domain/flag.js";

export const EVALUATE_BATCH_MAX_KEYS = 50;

export interface EvaluateRequest {
  readonly flag_key: string;
  readonly env?: string;
  readonly environment?: string;
  readonly user: { id?: unknown; attrs?: unknown };
}

export interface EvaluateResponse extends EvalResult {
  readonly flag_key: string;
}

export interface EvaluateBatchRequest {
  readonly env?: string;
  readonly environment?: string;
  readonly user: { id?: unknown; attrs?: unknown };
  readonly flag_keys: unknown;
}

export function resolveEvaluateEnv(input: {
  readonly env?: unknown;
  readonly environment?: unknown;
}): string {
  const envPresent = input.env !== undefined;
  const aliasPresent = input.environment !== undefined;
  if (!envPresent && !aliasPresent) {
    throw new ValidationError([
      { path: "/env", message: "required unless environment is provided" },
      { path: "/environment", message: "required unless env is provided" },
    ]);
  }
  if (envPresent && typeof input.env !== "string") {
    throw new ValidationError([{ path: "/env", message: "must be a string" }]);
  }
  if (aliasPresent && typeof input.environment !== "string") {
    throw new ValidationError([{ path: "/environment", message: "must be a string" }]);
  }
  if (envPresent && aliasPresent && input.env !== input.environment) {
    throw new ValidationError([
      { path: "/env", message: "must match environment when both are provided" },
      { path: "/environment", message: "must match env when both are provided" },
    ]);
  }
  return (envPresent ? input.env : input.environment) as string;
}

export type EvaluateBatchResponse = Record<string, EvaluateResponse>;

function parseFlagKeys(raw: unknown): FlagKey[] {
  if (!Array.isArray(raw)) {
    throw new ValidationError([
      { path: "/flag_keys", message: "must be an array of 1–50 flag keys" },
    ]);
  }
  if (raw.length < 1 || raw.length > EVALUATE_BATCH_MAX_KEYS) {
    throw new ValidationError([
      { path: "/flag_keys", message: "must contain between 1 and 50 keys" },
    ]);
  }
  return raw.map((key, index) => {
    if (typeof key !== "string") {
      throw new ValidationError([
        { path: `/flag_keys/${String(index)}`, message: "must be a string" },
      ]);
    }
    return parseFlagKey(key, `/flag_keys/${String(index)}`);
  });
}

function toResponse(flagKey: string, result: EvalResult): EvaluateResponse {
  return {
    flag_key: flagKey,
    value: result.value,
    reason: result.reason,
    variant: result.variant,
  };
}

export async function evaluateFlag(
  source: SnapshotSource,
  projectId: string,
  input: EvaluateRequest,
): Promise<EvaluateResponse> {
  const flagKey = parseFlagKey(input.flag_key, "/flag_key");
  const env = parseEnvKey(resolveEvaluateEnv(input), "/env");
  const user = parseEvalUser(input.user);
  const snapshot = await source.get(projectId, env);
  const result = evaluate(snapshot?.flags.get(flagKey), user, snapshot?.salt ?? "");
  return toResponse(flagKey, result);
}

export async function evaluateBatch(
  source: SnapshotSource,
  projectId: string,
  input: EvaluateBatchRequest,
): Promise<EvaluateBatchResponse> {
  const env = parseEnvKey(resolveEvaluateEnv(input), "/env");
  const user = parseEvalUser(input.user);
  const flagKeys = parseFlagKeys(input.flag_keys);
  const snapshot = await source.get(projectId, env);
  const salt = snapshot?.salt ?? "";
  const results: EvaluateBatchResponse = {};
  for (const flagKey of flagKeys) {
    results[flagKey] = toResponse(flagKey, evaluate(snapshot?.flags.get(flagKey), user, salt));
  }
  return results;
}
