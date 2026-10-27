import { describe, expect, it } from "vitest";

import { matchRule, type PredicateUser, type RuleOp } from "./index.js";

const user: PredicateUser = {
  id: "u-1",
  attrs: { plan: "pro", age: 21, tag: "acme-west", flags: true },
};

function rule(
  op: RuleOp,
  value: string | number | boolean | null | readonly (string | number | boolean | null)[],
  attribute = "user.plan",
) {
  return { attribute, op, value };
}

describe("matchRule (FR-RULE-003)", () => {
  it.each([
    ["eq", "pro", "user.plan", true],
    ["eq", "free", "user.plan", false],
    ["neq", "free", "user.plan", true],
    ["neq", "pro", "user.plan", false],
    ["contains", "acme", "user.tag", true],
    ["contains", "east", "user.tag", false],
    ["gt", 18, "user.age", true],
    ["gt", 21, "user.age", false],
    ["gte", 21, "user.age", true],
    ["lt", 30, "user.age", true],
    ["lte", 21, "user.age", true],
    ["lte", 20, "user.age", false],
  ] as const)("%s %s on %s → %s", (op, value, attribute, expected) => {
    expect(matchRule(rule(op, value, attribute), user)).toBe(expected);
  });

  it("in / not_in match membership", () => {
    expect(matchRule(rule("in", ["pro", "ent"], "user.plan"), user)).toBe(true);
    expect(matchRule(rule("in", ["free"], "user.plan"), user)).toBe(false);
    expect(matchRule(rule("not_in", ["free"], "user.plan"), user)).toBe(true);
    expect(matchRule(rule("not_in", ["pro"], "user.plan"), user)).toBe(false);
  });

  it("missing attribute never matches, including neq and not_in", () => {
    const noAttrs = { id: "u-1" };
    expect(matchRule(rule("eq", "pro"), noAttrs)).toBe(false);
    expect(matchRule(rule("neq", "pro"), noAttrs)).toBe(false);
    expect(matchRule(rule("not_in", ["US"], "user.country"), noAttrs)).toBe(false);
    expect(matchRule(rule("gt", 1, "user.age"), noAttrs)).toBe(false);
    expect(matchRule(rule("contains", "x", "user.tag"), noAttrs)).toBe(false);
  });

  it("wrong types are false, with no throw", () => {
    expect(matchRule(rule("gt", 18, "user.plan"), user)).toBe(false);
    expect(matchRule(rule("contains", "pro", "user.age"), user)).toBe(false);
    expect(matchRule(rule("eq", "21", "user.age"), user)).toBe(false);
    expect(() => matchRule(rule("gt", 18, "user.plan"), user)).not.toThrow();
  });

  it("user.id reads the id field", () => {
    expect(matchRule(rule("eq", "u-1", "user.id"), user)).toBe(true);
    expect(matchRule(rule("eq", "other", "user.id"), user)).toBe(false);
  });

  it("bare attribute names read attrs", () => {
    expect(matchRule(rule("eq", "pro", "plan"), user)).toBe(true);
  });

  it("eq null matches a present null, not a missing attr", () => {
    const withNull = { id: "u", attrs: { plan: null } };
    expect(matchRule(rule("eq", null, "user.plan"), withNull)).toBe(true);
    expect(matchRule(rule("eq", null, "user.plan"), { id: "u" })).toBe(false);
  });
});
