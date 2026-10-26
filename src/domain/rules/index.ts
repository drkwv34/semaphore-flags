import { ValidationError, type FieldError } from "../errors.js";

/**
 * Pure targeting-rule predicates (SRS FR-RULE-*). A missing attribute never throws; it simply
 * does not match.
 *
 * Write-path validation (FR-RULE-001/004) and runtime match (FR-RULE-003) both live here.
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

export type JsonPrimitive = string | number | boolean | null;

export interface RuleDraft {
  readonly id?: string;
  readonly priority: number;
  readonly attribute: string;
  readonly op: string;
  readonly value: unknown;
  readonly serve: unknown;
}

export interface ValidatedRule {
  readonly id?: string;
  readonly priority: number;
  readonly attribute: string;
  readonly op: RuleOp;
  readonly value: JsonPrimitive | readonly JsonPrimitive[];
  readonly serve: boolean;
}

const RULE_OP_SET = new Set<string>(RULE_OPS);

export function isRuleOp(raw: string): raw is RuleOp {
  return RULE_OP_SET.has(raw);
}

export function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean"
  );
}

export interface RulePredicate {
  readonly attribute: string;
  readonly op: RuleOp;
  readonly value: JsonPrimitive | readonly JsonPrimitive[];
}

export interface PredicateUser {
  readonly id: string;
  readonly attrs?: Readonly<Record<string, JsonPrimitive>>;
}

function resolveAttribute(attribute: string, user: PredicateUser): JsonPrimitive | undefined {
  if (attribute === "user.id") return user.id;
  const name = attribute.startsWith("user.") ? attribute.slice("user.".length) : attribute;
  if (name.length === 0) return undefined;
  const attrs = user.attrs;
  if (attrs === undefined || !Object.hasOwn(attrs, name)) return undefined;
  return attrs[name];
}

function samePrimitive(left: JsonPrimitive, right: JsonPrimitive): boolean {
  return Object.is(left, right);
}

/** Runtime predicate (FR-RULE-003). Missing attributes and incomparable types are false. */
export function matchRule(rule: RulePredicate, user: PredicateUser): boolean {
  const left = resolveAttribute(rule.attribute, user);
  switch (rule.op) {
    case "eq":
      return left !== undefined && isJsonPrimitive(rule.value) && samePrimitive(left, rule.value);
    case "neq":
      return left !== undefined && isJsonPrimitive(rule.value) && !samePrimitive(left, rule.value);
    case "in": {
      if (left === undefined || !Array.isArray(rule.value)) return false;
      return rule.value.some((item) => isJsonPrimitive(item) && samePrimitive(left, item));
    }
    case "not_in": {
      if (left === undefined || !Array.isArray(rule.value)) return false;
      return !rule.value.some((item) => isJsonPrimitive(item) && samePrimitive(left, item));
    }
    case "contains":
      return (
        typeof left === "string" && typeof rule.value === "string" && left.includes(rule.value)
      );
    case "gt":
      return typeof left === "number" && typeof rule.value === "number" && left > rule.value;
    case "gte":
      return typeof left === "number" && typeof rule.value === "number" && left >= rule.value;
    case "lt":
      return typeof left === "number" && typeof rule.value === "number" && left < rule.value;
    case "lte":
      return typeof left === "number" && typeof rule.value === "number" && left <= rule.value;
  }
}

function valueError(op: RuleOp, value: unknown): string | undefined {
  switch (op) {
    case "in":
    case "not_in": {
      if (!Array.isArray(value) || value.length === 0) {
        return "must be a non-empty array of JSON primitives";
      }
      if (!value.every(isJsonPrimitive)) {
        return "must be a non-empty array of JSON primitives";
      }
      return undefined;
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return "must be a number";
      }
      return undefined;
    }
    case "eq":
    case "neq":
    case "contains": {
      if (!isJsonPrimitive(value)) {
        return "must be a JSON primitive";
      }
      return undefined;
    }
  }
}

export function rulesEqual(a: ValidatedRule, b: ValidatedRule): boolean {
  return (
    a.priority === b.priority &&
    a.attribute === b.attribute &&
    a.op === b.op &&
    a.serve === b.serve &&
    JSON.stringify(a.value) === JSON.stringify(b.value)
  );
}

export function validateRules(rules: readonly RuleDraft[]): ValidatedRule[] {
  const fields: FieldError[] = [];
  const seen = new Set<number>();
  const validated: ValidatedRule[] = [];

  rules.forEach((rule, index) => {
    const prefix = `/rules/${String(index)}`;
    let ok = true;

    if (!Number.isInteger(rule.priority)) {
      fields.push({ path: `${prefix}/priority`, message: "must be an integer" });
      ok = false;
    } else if (seen.has(rule.priority)) {
      fields.push({
        path: `${prefix}/priority`,
        message: "must be unique within the environment",
      });
      ok = false;
    } else {
      seen.add(rule.priority);
    }

    const attribute = typeof rule.attribute === "string" ? rule.attribute.trim() : "";
    if (attribute.length === 0) {
      fields.push({ path: `${prefix}/attribute`, message: "must be a non-empty string" });
      ok = false;
    }

    if (!isRuleOp(rule.op)) {
      fields.push({
        path: `${prefix}/op`,
        message: "must be one of eq,neq,in,not_in,contains,gt,gte,lt,lte",
      });
      ok = false;
    } else {
      const err = valueError(rule.op, rule.value);
      if (err !== undefined) {
        fields.push({ path: `${prefix}/value`, message: err });
        ok = false;
      }
    }

    if (typeof rule.serve !== "boolean") {
      fields.push({ path: `${prefix}/serve`, message: "must be a boolean" });
      ok = false;
    }

    if (rule.id !== undefined && (typeof rule.id !== "string" || rule.id.length === 0)) {
      fields.push({ path: `${prefix}/id`, message: "must be a non-empty string when present" });
      ok = false;
    }

    if (!ok || !isRuleOp(rule.op) || typeof rule.serve !== "boolean") return;

    const base: ValidatedRule = {
      priority: rule.priority,
      attribute,
      op: rule.op,
      value: rule.value as JsonPrimitive | readonly JsonPrimitive[],
      serve: rule.serve,
    };
    validated.push(rule.id !== undefined ? { ...base, id: rule.id } : base);
  });

  if (fields.length > 0) {
    throw new ValidationError(fields);
  }

  return [...validated].sort((a, b) => a.priority - b.priority);
}
