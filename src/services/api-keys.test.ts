import { describe, expect, it } from "vitest";

import { hashApiKey, parseApiKey } from "../domain/api-key.js";
import { mintApiKey } from "./api-keys.js";

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
