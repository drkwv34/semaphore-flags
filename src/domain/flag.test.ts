import { describe, expect, it } from "vitest";

import { ValidationError } from "./errors.js";
import { isFlagKey, parseClientFallback, parseFlagKey, parsePercentage } from "./flag.js";

describe("parseFlagKey", () => {
  it.each(["ab", "checkout_v2", "kill_switch", "a1", "a".repeat(64)])("accepts %s", (key) => {
    expect(parseFlagKey(key)).toBe(key);
    expect(isFlagKey(key)).toBe(true);
  });

  it.each([
    ["", "empty"],
    ["A", "uppercase"],
    ["x", "single char"],
    ["1dev", "leading digit"],
    ["-dev", "leading hyphen"],
    ["dev-1", "hyphen"],
    ["a".repeat(65), "too long"],
  ])("rejects %s (%s)", (key) => {
    expect(isFlagKey(key)).toBe(false);
    expect(() => parseFlagKey(key)).toThrow(ValidationError);
  });
});

describe("parseClientFallback", () => {
  it("accepts fail_closed and fail_open", () => {
    expect(parseClientFallback("fail_closed")).toBe("fail_closed");
    expect(parseClientFallback("fail_open")).toBe("fail_open");
  });

  it("rejects unknown values", () => {
    expect(() => parseClientFallback("fail_halfway")).toThrow(ValidationError);
  });
});

describe("parsePercentage", () => {
  it.each([0, 1, 50, 100])("accepts %s", (n) => {
    expect(parsePercentage(n)).toBe(n);
  });

  it.each([-1, 101, 1.5, Number.NaN])("rejects %s", (n) => {
    expect(() => parsePercentage(n)).toThrow(ValidationError);
  });
});
