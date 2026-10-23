import { describe, expect, it } from "vitest";

import { ValidationError } from "../errors.js";
import { validateRules, type RuleDraft } from "./index.js";

function draft(overrides: Partial<RuleDraft> & Pick<RuleDraft, "op" | "value">): RuleDraft {
  return {
    priority: 0,
    attribute: "user.plan",
    serve: true,
    ...overrides,
  };
}

describe("validateRules", () => {
  it("accepts a valid eq rule and returns it sorted", () => {
    const rules = validateRules([
      draft({ priority: 5, op: "eq", value: "pro" }),
      draft({ priority: 1, attribute: "user.id", op: "neq", value: "anon", serve: false }),
    ]);
    expect(rules.map((r) => r.priority)).toEqual([1, 5]);
    expect(rules[1]?.value).toBe("pro");
  });

  it.each([
    ["in", ["a", 1, true, null]],
    ["not_in", ["x"]],
    ["contains", "acme"],
    ["gt", 4],
    ["gte", 0],
    ["lt", -1.5],
    ["lte", 99],
    ["eq", null],
    ["neq", false],
  ] as const)("accepts op %s", (op, value) => {
    expect(validateRules([draft({ op, value })])).toHaveLength(1);
  });

  it("rejects empty or whitespace attribute", () => {
    expect(() => validateRules([draft({ attribute: "  ", op: "eq", value: "x" })])).toThrow(
      ValidationError,
    );
    try {
      validateRules([draft({ attribute: "", op: "eq", value: "x" })]);
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).fields).toEqual([
        { path: "/rules/0/attribute", message: "must be a non-empty string" },
      ]);
    }
  });

  it("rejects unknown ops", () => {
    try {
      validateRules([draft({ op: "regex", value: "x" })]);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).fields[0]?.path).toBe("/rules/0/op");
    }
  });

  it("rejects empty in/not_in arrays and nested objects", () => {
    expect(() => validateRules([draft({ op: "in", value: [] })])).toThrow(ValidationError);
    expect(() => validateRules([draft({ op: "not_in", value: [{ x: 1 }] })])).toThrow(
      ValidationError,
    );
  });

  it("rejects numeric ops with a string", () => {
    try {
      validateRules([draft({ op: "gt", value: "5" })]);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).fields).toEqual([
        { path: "/rules/0/value", message: "must be a number" },
      ]);
    }
  });

  it("rejects eq with objects or arrays", () => {
    expect(() => validateRules([draft({ op: "eq", value: { x: 1 } })])).toThrow(ValidationError);
    expect(() => validateRules([draft({ op: "eq", value: [1] })])).toThrow(ValidationError);
  });

  it("rejects duplicate priorities with field errors", () => {
    try {
      validateRules([
        draft({ priority: 0, op: "eq", value: "a" }),
        draft({ priority: 0, op: "eq", value: "b" }),
      ]);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).fields[0]).toMatchObject({ path: "/rules/1/priority" });
    }
  });

  it("collects multiple field errors", () => {
    try {
      validateRules([draft({ attribute: "", op: "nope", value: { x: 1 }, serve: "yes" })]);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const paths = (err as ValidationError).fields.map((f) => f.path);
      expect(paths).toContain("/rules/0/attribute");
      expect(paths).toContain("/rules/0/op");
      expect(paths).toContain("/rules/0/serve");
    }
  });
});
