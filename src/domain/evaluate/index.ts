/**
 * Pure evaluation algorithm and hash bucketing (SRS FR-EVAL-002). No I/O, no framework imports;
 * operates on compiled snapshot objects handed in by the caller.
 *
 * Scaffold only: the algorithm and hash_bucket land via an OpenSpec change on the evaluate-core day.
 */

/** Normative reason enum (SRS FR-EVAL-001). Order and spelling are part of the API contract. */
export const EVALUATION_REASONS = [
  "disabled",
  "rule_match",
  "percentage_in",
  "percentage_out",
  "default",
  "archived",
  "not_found",
] as const;

export type EvaluationReason = (typeof EVALUATION_REASONS)[number];
