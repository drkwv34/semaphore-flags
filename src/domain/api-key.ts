import { createHash, timingSafeEqual } from "node:crypto";

export const API_KEY_TYPES = ["admin", "evaluate"] as const;
export type ApiKeyType = (typeof API_KEY_TYPES)[number];

const RAW_KEY_PATTERN = /^sf_(admin|eval)_([0-9a-f]{8})_[0-9a-f]{64}$/;

export interface ParsedApiKey {
  readonly type: ApiKeyType;
  readonly prefix: string;
}

export function parseApiKey(raw: string): ParsedApiKey | undefined {
  const match = RAW_KEY_PATTERN.exec(raw);
  if (!match) return undefined;
  const label = match[1];
  const shortId = match[2];
  if (label === undefined || shortId === undefined) return undefined;
  const type: ApiKeyType = label === "admin" ? "admin" : "evaluate";
  return { type, prefix: `sf_${label}_${shortId}` };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Constant-time compare of two SHA-256 hex digests. Length mismatch returns false. */
export function hashesMatch(storedHex: string, presentedHex: string): boolean {
  try {
    const stored = Buffer.from(storedHex, "hex");
    const presented = Buffer.from(presentedHex, "hex");
    if (stored.length !== 32 || presented.length !== 32) return false;
    return timingSafeEqual(stored, presented);
  } catch {
    return false;
  }
}

/** Dummy SHA-256 digest used so unknown-prefix lookups still pay a compare. */
export const DUMMY_KEY_HASH = hashApiKey("sf_admin_00000000_" + "00".repeat(32));
