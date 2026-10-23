import { ValidationError } from "./errors.js";

/** Flag key regex (FR-FLAG-001). First char letter; total length 2–64; underscore allowed. */
export const FLAG_KEY_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;

export const FLAG_TYPES = ["boolean"] as const;
export type FlagType = (typeof FLAG_TYPES)[number];

export const CLIENT_FALLBACKS = ["fail_closed", "fail_open"] as const;
export type ClientFallback = (typeof CLIENT_FALLBACKS)[number];

export type FlagKey = string & { readonly __brand: "FlagKey" };

export function parseFlagKey(raw: string, path = "/key"): FlagKey {
  if (!FLAG_KEY_PATTERN.test(raw)) {
    throw new ValidationError([{ path, message: "must match ^[a-z][a-z0-9_]{1,63}$" }]);
  }
  return raw as FlagKey;
}

export function isFlagKey(raw: string): raw is FlagKey {
  return FLAG_KEY_PATTERN.test(raw);
}

export function parseClientFallback(raw: string, path = "/client_fallback"): ClientFallback {
  if (raw === "fail_closed" || raw === "fail_open") return raw;
  throw new ValidationError([{ path, message: "must be one of fail_closed, fail_open" }]);
}

export function parsePercentage(raw: number, path = "/percentage"): number {
  if (!Number.isInteger(raw) || raw < 0 || raw > 100) {
    throw new ValidationError([{ path, message: "must be an integer between 0 and 100" }]);
  }
  return raw;
}
