import { randomBytes } from "node:crypto";

import { hashApiKey, type ApiKeyType } from "../domain/api-key.js";

export interface MintedApiKey {
  readonly type: ApiKeyType;
  readonly raw: string;
  readonly prefix: string;
  readonly keyHash: string;
}

export function mintApiKey(type: ApiKeyType): MintedApiKey {
  const label = type === "admin" ? "admin" : "eval";
  const shortId = randomBytes(4).toString("hex");
  const secret = randomBytes(32).toString("hex");
  const prefix = `sf_${label}_${shortId}`;
  const raw = `${prefix}_${secret}`;
  return { type, raw, prefix, keyHash: hashApiKey(raw) };
}
