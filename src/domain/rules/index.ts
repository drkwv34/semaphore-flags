/**
 * Pure targeting-rule predicates (SRS FR-RULE-*). A missing attribute never throws; it simply
 * does not match.
 *
 * Scaffold only: predicate implementations land via an OpenSpec change.
 */

export const RULE_OPS = [
  "eq",
  "neq",
  "in",
  "not_in",
  "contains",
  "gt",
  "gte",
  "lt",
  "lte",
] as const;

export type RuleOp = (typeof RULE_OPS)[number];
