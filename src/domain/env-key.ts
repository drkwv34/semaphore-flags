import { ValidationError } from "./errors.js";

/** Environment key regex (FR-PROJ-003). First char letter; total length 2–32. */
export const ENV_KEY_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;

export const DEFAULT_ENV_KEYS = ["dev", "staging", "prod"] as const;

export type EnvKey = string & { readonly __brand: "EnvKey" };

export function parseEnvKey(raw: string, path = "/key"): EnvKey {
  if (!ENV_KEY_PATTERN.test(raw)) {
    throw new ValidationError([{ path, message: "must match ^[a-z][a-z0-9-]{1,31}$" }]);
  }
  return raw as EnvKey;
}

export function isEnvKey(raw: string): raw is EnvKey {
  return ENV_KEY_PATTERN.test(raw);
}
