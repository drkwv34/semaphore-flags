import { describe, expect, it } from "vitest";

import { compiledRuleFromJoinedRow, type JoinedRuleRow } from "./snapshots.js";

function joined(overrides: Partial<JoinedRuleRow> = {}): JoinedRuleRow {
  return {
    attribute: "user.x",
    op: "eq",
    value: "kept",
    serve: true,
    ...overrides,
  };
}

describe("compiledRuleFromJoinedRow (FR-RULE-001, FR-RULE-004)", () => {
  it("keeps eq JSON null as a compiled rule", () => {
    expect(compiledRuleFromJoinedRow(joined({ op: "eq", value: null }))).toEqual({
      attribute: "user.x",
      op: "eq",
      value: null,
      serve: true,
    });
  });

  it("keeps neq JSON null as a compiled rule", () => {
    expect(compiledRuleFromJoinedRow(joined({ op: "neq", value: null }))).toEqual({
      attribute: "user.x",
      op: "neq",
      value: null,
      serve: true,
    });
  });

  it("skips an empty LEFT JOIN row", () => {
    expect(
      compiledRuleFromJoinedRow({
        attribute: null,
        op: null,
        value: null,
        serve: null,
      }),
    ).toBeUndefined();
  });

  it("still maps in/not_in arrays", () => {
    expect(compiledRuleFromJoinedRow(joined({ op: "in", value: ["a", null] }))).toEqual({
      attribute: "user.x",
      op: "in",
      value: ["a", null],
      serve: true,
    });
  });
});
