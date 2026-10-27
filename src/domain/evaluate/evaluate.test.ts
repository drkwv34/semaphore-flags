import { describe, expect, it } from "vitest";

import { matchRule } from "../rules/index.js";
import {
  compileSnapshot,
  evaluate,
  hashBucket,
  parseEvalUser,
  type CompiledFlag,
  type EvalUser,
} from "./index.js";

const salt = "fixture-salt";
const user: EvalUser = { id: "user-76", attrs: { plan: "pro", age: 21, country: "US" } };

function flag(overrides: Partial<CompiledFlag> = {}): CompiledFlag {
  return {
    key: "checkout_v2",
    archived: false,
    defaultValue: false,
    enabled: true,
    percentage: 50,
    rules: [],
    ...overrides,
  };
}

describe("evaluate (FR-EVAL-002)", () => {
  it("returns not_found for a missing flag", () => {
    expect(evaluate(undefined, user, salt)).toEqual({
      value: false,
      reason: "not_found",
      variant: "off",
    });
  });

  it("returns archived false even when a rule would match", () => {
    const archived = flag({
      archived: true,
      enabled: true,
      defaultValue: true,
      rules: [{ attribute: "user.plan", op: "eq", value: "pro", serve: true }],
    });
    expect(evaluate(archived, user, salt)).toEqual({
      value: false,
      reason: "archived",
      variant: "off",
    });
  });

  it("disabled flag ignores matching rule and returns default", () => {
    const disabled = flag({
      enabled: false,
      defaultValue: true,
      percentage: 100,
      rules: [{ attribute: "user.plan", op: "eq", value: "pro", serve: false }],
    });
    expect(evaluate(disabled, user, salt)).toEqual({
      value: true,
      reason: "disabled",
      variant: "on",
    });
  });

  it("disabled with default false returns variant off", () => {
    expect(evaluate(flag({ enabled: false, defaultValue: false }), user, salt)).toEqual({
      value: false,
      reason: "disabled",
      variant: "off",
    });
  });

  it("first matching rule wins by stored order", () => {
    const withRules = flag({
      rules: [
        { attribute: "user.plan", op: "eq", value: "pro", serve: true },
        { attribute: "user.country", op: "eq", value: "US", serve: false },
      ],
    });
    expect(evaluate(withRules, user, salt)).toEqual({
      value: true,
      reason: "rule_match",
      variant: "on",
    });
  });

  it("percentage 0 is everyone out after rules", () => {
    expect(evaluate(flag({ percentage: 0 }), user, salt)).toEqual({
      value: false,
      reason: "percentage_out",
      variant: "off",
    });
  });

  it("percentage 100 is everyone in after rules", () => {
    expect(evaluate(flag({ percentage: 100 }), { id: "anyone" }, salt)).toEqual({
      value: true,
      reason: "percentage_in",
      variant: "on",
    });
  });

  it("bucket 0 is in at percentage 1", () => {
    expect(hashBucket(salt, "checkout_v2", "user-76")).toBe(0);
    expect(evaluate(flag({ percentage: 1 }), { id: "user-76" }, salt)).toEqual({
      value: true,
      reason: "percentage_in",
      variant: "on",
    });
  });

  it("bucket 99 is out at percentage 99", () => {
    expect(hashBucket(salt, "checkout_v2", "user-39")).toBe(99);
    expect(evaluate(flag({ percentage: 99 }), { id: "user-39" }, salt)).toEqual({
      value: false,
      reason: "percentage_out",
      variant: "off",
    });
  });

  it("missing attribute skips the rule and falls through to percentage", () => {
    const withRule = flag({
      percentage: 0,
      rules: [{ attribute: "user.plan", op: "eq", value: "pro", serve: true }],
    });
    expect(evaluate(withRule, { id: "user-76" }, salt)).toEqual({
      value: false,
      reason: "percentage_out",
      variant: "off",
    });
  });
});

describe("compileSnapshot", () => {
  it("indexes flags by key", () => {
    const snapshot = compileSnapshot({
      projectId: "p1",
      env: "dev",
      salt,
      flags: [flag()],
    });
    expect(snapshot.flags.get("checkout_v2")?.percentage).toBe(50);
    expect(evaluate(snapshot.flags.get("missing"), user, snapshot.salt).reason).toBe("not_found");
  });
});

describe("parseEvalUser", () => {
  it("accepts id and primitive attrs", () => {
    expect(parseEvalUser({ id: "u1", attrs: { plan: "pro", n: 1, ok: true, x: null } })).toEqual({
      id: "u1",
      attrs: { plan: "pro", n: 1, ok: true, x: null },
    });
  });

  it("rejects empty or overlong id", () => {
    expect(() => parseEvalUser({ id: "" })).toThrow();
    expect(() => parseEvalUser({ id: "a".repeat(129) })).toThrow();
  });
});

describe("matchRule used by evaluate", () => {
  it("treats a missing attribute as a non-match", () => {
    expect(matchRule({ attribute: "user.plan", op: "eq", value: "pro" }, { id: "u" })).toBe(false);
  });
});
