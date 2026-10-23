import type { Queryable } from "./pool.js";
import { translatePgError } from "./pg-error.js";

export interface FlagEnvConfig {
  readonly flagId: string;
  readonly environmentId: string;
  readonly envKey: string;
  readonly enabled: boolean;
  readonly percentage: number;
  readonly updatedAt: Date;
}

interface FlagEnvConfigRow {
  flag_id: string;
  environment_id: string;
  env_key: string;
  enabled: boolean;
  percentage: number;
  updated_at: Date;
}

function toConfig(row: FlagEnvConfigRow): FlagEnvConfig {
  return {
    flagId: row.flag_id,
    environmentId: row.environment_id,
    envKey: row.env_key,
    enabled: row.enabled,
    percentage: row.percentage,
    updatedAt: row.updated_at,
  };
}

export async function insertFlagEnvConfig(
  db: Queryable,
  input: {
    flagId: string;
    environmentId: string;
    enabled?: boolean;
    percentage?: number;
  },
): Promise<void> {
  try {
    await db.query(
      `INSERT INTO flag_env_configs (flag_id, environment_id, enabled, percentage)
       VALUES ($1, $2, $3, $4)`,
      [input.flagId, input.environmentId, input.enabled ?? false, input.percentage ?? 0],
    );
  } catch (err) {
    translatePgError(err);
  }
}

export async function upsertFlagEnvConfig(
  db: Queryable,
  input: {
    flagId: string;
    environmentId: string;
    enabled: boolean;
    percentage: number;
  },
): Promise<FlagEnvConfig> {
  try {
    const res = await db.query<FlagEnvConfigRow>(
      `INSERT INTO flag_env_configs (flag_id, environment_id, enabled, percentage, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (flag_id, environment_id) DO UPDATE
         SET enabled = EXCLUDED.enabled,
             percentage = EXCLUDED.percentage,
             updated_at = now()
       RETURNING flag_id, environment_id, enabled, percentage, updated_at,
                 (SELECT key FROM environments WHERE id = flag_env_configs.environment_id) AS env_key`,
      [input.flagId, input.environmentId, input.enabled, input.percentage],
    );
    const row = res.rows[0];
    if (!row) throw new Error("upsert flag_env_config returned no row");
    return toConfig(row);
  } catch (err) {
    translatePgError(err);
  }
}

export async function listFlagEnvConfigs(
  db: Queryable,
  flagId: string,
): Promise<readonly FlagEnvConfig[]> {
  const res = await db.query<FlagEnvConfigRow>(
    `SELECT c.flag_id, c.environment_id, e.key AS env_key, c.enabled, c.percentage, c.updated_at
     FROM flag_env_configs c
     JOIN environments e ON e.id = c.environment_id
     WHERE c.flag_id = $1
     ORDER BY e.key`,
    [flagId],
  );
  return res.rows.map(toConfig);
}

export async function findFlagEnvConfig(
  db: Queryable,
  flagId: string,
  environmentId: string,
): Promise<FlagEnvConfig | undefined> {
  const res = await db.query<FlagEnvConfigRow>(
    `SELECT c.flag_id, c.environment_id, e.key AS env_key, c.enabled, c.percentage, c.updated_at
     FROM flag_env_configs c
     JOIN environments e ON e.id = c.environment_id
     WHERE c.flag_id = $1 AND c.environment_id = $2`,
    [flagId, environmentId],
  );
  const row = res.rows[0];
  return row ? toConfig(row) : undefined;
}
