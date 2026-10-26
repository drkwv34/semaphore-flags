import {
  evaluate,
  parseEvalUser,
  type EvalResult,
  type SnapshotSource,
} from "../domain/evaluate/index.js";
import { parseEnvKey } from "../domain/env-key.js";
import { parseFlagKey } from "../domain/flag.js";

export interface EvaluateRequest {
  readonly flag_key: string;
  readonly env: string;
  readonly user: { id?: unknown; attrs?: unknown };
}

export interface EvaluateResponse extends EvalResult {
  readonly flag_key: string;
}

export async function evaluateFlag(
  source: SnapshotSource,
  projectId: string,
  input: EvaluateRequest,
): Promise<EvaluateResponse> {
  const flagKey = parseFlagKey(input.flag_key, "/flag_key");
  const env = parseEnvKey(input.env, "/env");
  const user = parseEvalUser(input.user);
  const snapshot = await source.get(projectId, env);
  const result = evaluate(snapshot?.flags.get(flagKey), user, snapshot?.salt ?? "");
  return {
    flag_key: flagKey,
    value: result.value,
    reason: result.reason,
    variant: result.variant,
  };
}
