import { describe, expect, it } from "vitest";

import { DUMMY_KEY_HASH, hashApiKey, hashesMatch, parseApiKey } from "./api-key.js";

const adminRaw = "sf_admin_deadbeef_" + "ab".repeat(32);
const evalRaw = "sf_eval_cafef00d_" + "cd".repeat(32);

describe("parseApiKey", () => {
  it("parses an admin key into type and prefix", () => {
    expect(parseApiKey(adminRaw)).toEqual({ type: "admin", prefix: "sf_admin_deadbeef" });
  });

  it("parses an evaluate key into type and prefix", () => {
    expect(parseApiKey(evalRaw)).toEqual({ type: "evaluate", prefix: "sf_eval_cafef00d" });
  });

  it.each([
    "",
    "Bearer abc",
    "sf_admin_deadbee_" + "ab".repeat(32),
    "sf_ops_deadbeef_" + "ab".repeat(32),
    "sf_admin_deadbeef_" + "zz".repeat(32),
    "sf_admin_DEADBEEF_" + "ab".repeat(32),
  ])("rejects malformed %s", (raw) => {
    expect(parseApiKey(raw)).toBeUndefined();
  });
});

describe("hashApiKey / hashesMatch", () => {
  it("is stable SHA-256 hex of the full raw key", () => {
    const hash = hashApiKey(adminRaw);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashApiKey(adminRaw));
    expect(hash).not.toBe(hashApiKey(evalRaw));
  });

  it("matches equal hashes and rejects different ones", () => {
    const a = hashApiKey(adminRaw);
    expect(hashesMatch(a, hashApiKey(adminRaw))).toBe(true);
    expect(hashesMatch(a, hashApiKey(evalRaw))).toBe(false);
    expect(hashesMatch(a, DUMMY_KEY_HASH)).toBe(false);
  });

  it("rejects truncated or non-hex stored hashes without throwing", () => {
    expect(hashesMatch("abcd", hashApiKey(adminRaw))).toBe(false);
    expect(hashesMatch("not-hex", hashApiKey(adminRaw))).toBe(false);
  });
});
