import { describe, expect, it } from "vitest";

import { hashApiKey, parseApiKey } from "../domain/api-key.js";
import { mintApiKey, toKeyMetadata } from "./api-keys.js";
import type { ApiKeyRecord } from "../store/index.js";

describe("mintApiKey", () => {
  it("mints a parseable admin key whose hash matches the raw secret", () => {
    const minted = mintApiKey("admin");
    expect(minted.raw.startsWith("sf_admin_")).toBe(true);
    expect(parseApiKey(minted.raw)).toEqual({ type: "admin", prefix: minted.prefix });
    expect(minted.keyHash).toBe(hashApiKey(minted.raw));
    expect(minted.raw.includes(minted.keyHash)).toBe(false);
  });

  it("mints unique evaluate keys", () => {
    const a = mintApiKey("evaluate");
    const b = mintApiKey("evaluate");
    expect(parseApiKey(a.raw)?.type).toBe("evaluate");
    expect(a.raw).not.toBe(b.raw);
    expect(a.prefix).not.toBe(b.prefix);
  });
});

describe("toKeyMetadata", () => {
  it("exposes only non-secret fields", () => {
    const record: ApiKeyRecord = {
      id: "11111111-1111-4111-8111-111111111111",
      projectId: "22222222-2222-4222-8222-222222222222",
      type: "evaluate",
      prefix: "sf_eval_deadbeef",
      keyHash: "ab".repeat(32),
      createdAt: new Date("2026-11-18T00:00:00.000Z"),
      revokedAt: null,
    };
    const meta = toKeyMetadata(record);
    expect(meta).toEqual({
      id: record.id,
      type: "evaluate",
      prefix: "sf_eval_deadbeef",
      created_at: "2026-11-18T00:00:00.000Z",
      revoked_at: null,
    });
    const serialized = JSON.stringify(meta);
    expect(serialized).not.toContain("key_hash");
    expect(serialized).not.toContain(record.keyHash);
    expect(serialized).not.toContain("keyHash");
  });
});
