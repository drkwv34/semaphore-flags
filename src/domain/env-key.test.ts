import { describe, expect, it } from "vitest";

import { ValidationError } from "./errors.js";
import { DEFAULT_ENV_KEYS, isEnvKey, parseEnvKey } from "./env-key.js";

describe("parseEnvKey", () => {
  it.each(["dev", "staging", "prod", "qa", "us-east-1", "a1"])("accepts %s", (key) => {
    expect(parseEnvKey(key)).toBe(key);
    expect(isEnvKey(key)).toBe(true);
  });

  it.each([
    ["", "empty"],
    ["A", "uppercase"],
    ["x", "single char (quantifier {1,31} after first)"],
    ["-dev", "leading hyphen"],
    ["1dev", "leading digit"],
    ["dev_1", "underscore"],
    ["a".repeat(33), "too long"],
  ])("rejects %s (%s)", (key) => {
    expect(isEnvKey(key)).toBe(false);
    expect(() => parseEnvKey(key)).toThrow(ValidationError);
  });

  it("default env keys all match the regex", () => {
    for (const key of DEFAULT_ENV_KEYS) {
      expect(isEnvKey(key)).toBe(true);
    }
  });
});
