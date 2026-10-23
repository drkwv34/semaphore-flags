import type { JsonPrimitive, RuleOp, ValidatedRule } from "../domain/rules/index.js";
import type { Queryable } from "./pool.js";
import { translatePgError } from "./pg-error.js";

export interface StoredRule extends ValidatedRule {
  readonly id: string;
  readonly flagId: string;
  readonly environmentId: string;
}

interface RuleRow {
  id: string;
  flag_id: string;
  environment_id: string;
  priority: number;
  attribute: string;
  op: RuleOp;
  value: JsonPrimitive | JsonPrimitive[];
  serve: boolean;
}

function toRule(row: RuleRow): StoredRule {
  return {
    id: row.id,
    flagId: row.flag_id,
    environmentId: row.environment_id,
    priority: row.priority,
    attribute: row.attribute,
    op: row.op,
    value: row.value,
    serve: row.serve,
  };
}

export async function listRules(
  db: Queryable,
  flagId: string,
  environmentId?: string,
): Promise<readonly StoredRule[]> {
  const res =
    environmentId === undefined
      ? await db.query<RuleRow>(
          `SELECT id, flag_id, environment_id, priority, attribute, op, value, serve
           FROM rules WHERE flag_id = $1
           ORDER BY environment_id, priority`,
          [flagId],
        )
      : await db.query<RuleRow>(
          `SELECT id, flag_id, environment_id, priority, attribute, op, value, serve
           FROM rules WHERE flag_id = $1 AND environment_id = $2
           ORDER BY priority`,
          [flagId, environmentId],
        );
  return res.rows.map(toRule);
}

export async function deleteRulesForEnv(
  db: Queryable,
  flagId: string,
  environmentId: string,
): Promise<void> {
  await db.query(`DELETE FROM rules WHERE flag_id = $1 AND environment_id = $2`, [
    flagId,
    environmentId,
  ]);
}

export async function insertRule(
  db: Queryable,
  input: {
    id?: string;
    flagId: string;
    environmentId: string;
    priority: number;
    attribute: string;
    op: RuleOp;
    value: JsonPrimitive | readonly JsonPrimitive[];
    serve: boolean;
  },
): Promise<StoredRule> {
  try {
    const res = await db.query<RuleRow>(
      `INSERT INTO rules (id, flag_id, environment_id, priority, attribute, op, value, serve)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7::jsonb, $8)
       RETURNING id, flag_id, environment_id, priority, attribute, op, value, serve`,
      [
        input.id ?? null,
        input.flagId,
        input.environmentId,
        input.priority,
        input.attribute,
        input.op,
        JSON.stringify(input.value),
        input.serve,
      ],
    );
    const row = res.rows[0];
    if (!row) throw new Error("insert rule returned no row");
    return toRule(row);
  } catch (err) {
    translatePgError(err);
  }
}
