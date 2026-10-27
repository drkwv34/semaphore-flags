import {
  compileSnapshot,
  type CompiledEnvSnapshot,
  type CompiledRule,
  type SnapshotSource,
} from "../domain/evaluate/index.js";
import type { JsonPrimitive, RuleOp } from "../domain/rules/index.js";
import type { Queryable } from "./pool.js";

interface SnapshotRow {
  project_id: string;
  salt: string;
  env_key: string;
  flag_key: string | null;
  default_value: boolean | null;
  archived_at: Date | null;
  enabled: boolean | null;
  percentage: number | null;
  priority: number | null;
  attribute: string | null;
  op: RuleOp | null;
  value: JsonPrimitive | JsonPrimitive[] | null;
  serve: boolean | null;
}

interface MutableFlag {
  key: string;
  archived: boolean;
  defaultValue: boolean;
  enabled: boolean;
  percentage: number;
  rules: CompiledRule[];
}

export async function loadEnvSnapshot(
  db: Queryable,
  projectId: string,
  env: string,
): Promise<CompiledEnvSnapshot | undefined> {
  const res = await db.query<SnapshotRow>(
    `SELECT p.id AS project_id, p.salt, e.key AS env_key,
            f.key AS flag_key, f.default_value, f.archived_at,
            c.enabled, c.percentage,
            r.priority, r.attribute, r.op, r.value, r.serve
     FROM environments e
     JOIN projects p ON p.id = e.project_id
     LEFT JOIN flags f ON f.project_id = p.id
     LEFT JOIN flag_env_configs c ON c.flag_id = f.id AND c.environment_id = e.id
     LEFT JOIN rules r ON r.flag_id = f.id AND r.environment_id = e.id
     WHERE e.project_id = $1 AND e.key = $2
     ORDER BY f.key, r.priority`,
    [projectId, env],
  );
  const rows = res.rows;
  const first = rows[0];
  if (first === undefined) return undefined;

  const flags = new Map<string, MutableFlag>();
  for (const row of rows) {
    if (
      row.flag_key === null ||
      row.default_value === null ||
      row.enabled === null ||
      row.percentage === null
    ) {
      continue;
    }
    let flag = flags.get(row.flag_key);
    if (flag === undefined) {
      flag = {
        key: row.flag_key,
        archived: row.archived_at !== null,
        defaultValue: row.default_value,
        enabled: row.enabled,
        percentage: row.percentage,
        rules: [],
      };
      flags.set(row.flag_key, flag);
    }
    if (row.attribute !== null && row.op !== null && row.value !== null && row.serve !== null) {
      flag.rules.push({
        attribute: row.attribute,
        op: row.op,
        value: row.value,
        serve: row.serve,
      });
    }
  }

  return compileSnapshot({
    projectId: first.project_id,
    env: first.env_key,
    salt: first.salt,
    flags: [...flags.values()],
  });
}

export function postgresSnapshotSource(db: Queryable): SnapshotSource {
  return {
    get(projectId: string, env: string) {
      return loadEnvSnapshot(db, projectId, env);
    },
  };
}
