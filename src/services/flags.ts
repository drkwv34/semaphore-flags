import { ConflictError, NotFoundError, ValidationError } from "../domain/errors.js";
import {
  parseClientFallback,
  parseFlagKey,
  parsePercentage,
  type ClientFallback,
} from "../domain/flag.js";
import {
  rulesEqual,
  validateRules,
  type RuleDraft,
  type ValidatedRule,
} from "../domain/rules/index.js";
import {
  archiveFlag as archiveFlagRow,
  deleteRulesForEnv,
  findEnvironmentByKey,
  findFlagByKey,
  findFlagEnvConfig,
  insertAuditEvent,
  insertFlag,
  insertFlagEnvConfig,
  insertRule,
  listEnvironments,
  listFlagEnvConfigs,
  listFlags as listFlagRows,
  listRules,
  lockFlagByKey,
  updateFlag as updateFlagRow,
  upsertFlagEnvConfig,
  withTx,
  type Flag,
  type FlagEnvConfig,
  type Pool,
  type Queryable,
  type StoredRule,
} from "../store/index.js";

export interface MutationContext {
  readonly projectId: string;
  readonly actorKeyId: string;
  readonly requestId: string;
}

export interface MutationHooks {
  readonly invalidateEnvs?: (projectId: string, envs: readonly string[]) => Promise<void>;
  readonly recordMutation?: (action: string) => void;
}

async function afterMutation(
  hooks: MutationHooks | undefined,
  projectId: string,
  envs: readonly string[],
  action: string,
): Promise<void> {
  if (hooks?.invalidateEnvs !== undefined) {
    await hooks.invalidateEnvs(projectId, envs);
  }
  hooks?.recordMutation?.(action);
}

export interface RuleJson {
  readonly id: string;
  readonly priority: number;
  readonly attribute: string;
  readonly op: string;
  readonly value: unknown;
  readonly serve: boolean;
}

export interface EnvConfigJson {
  readonly key: string;
  readonly enabled: boolean;
  readonly percentage: number;
  readonly updated_at: string;
  readonly rules: readonly RuleJson[];
}

export interface FlagJson {
  readonly id: string;
  readonly key: string;
  readonly description: string;
  readonly flag_type: "boolean";
  readonly default_value: boolean;
  readonly client_fallback: ClientFallback;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface FlagDetailJson extends FlagJson {
  readonly envs: readonly EnvConfigJson[];
}

export interface FlagListJson {
  readonly items: readonly FlagJson[];
  readonly limit: number;
  readonly offset: number;
}

export interface CreateFlagInput {
  readonly key: string;
  readonly description?: string;
  readonly default_value: boolean;
  readonly client_fallback?: string;
}

export interface PatchFlagInput {
  readonly description?: string;
  readonly default_value?: boolean;
  readonly client_fallback?: string;
}

export interface PutEnvConfigInput {
  readonly enabled: boolean;
  readonly percentage: number;
  readonly rules: readonly RuleDraft[];
}

function toFlagJson(flag: Flag): FlagJson {
  return {
    id: flag.id,
    key: flag.key,
    description: flag.description,
    flag_type: "boolean",
    default_value: flag.defaultValue,
    client_fallback: flag.clientFallback,
    archived_at: flag.archivedAt ? flag.archivedAt.toISOString() : null,
    created_at: flag.createdAt.toISOString(),
    updated_at: flag.updatedAt.toISOString(),
  };
}

function toRuleJson(rule: StoredRule): RuleJson {
  return {
    id: rule.id,
    priority: rule.priority,
    attribute: rule.attribute,
    op: rule.op,
    value: rule.value,
    serve: rule.serve,
  };
}

function toEnvJson(config: FlagEnvConfig, rules: readonly StoredRule[]): EnvConfigJson {
  return {
    key: config.envKey,
    enabled: config.enabled,
    percentage: config.percentage,
    updated_at: config.updatedAt.toISOString(),
    rules: rules.map(toRuleJson),
  };
}

function asValidated(rule: StoredRule): ValidatedRule {
  return {
    id: rule.id,
    priority: rule.priority,
    attribute: rule.attribute,
    op: rule.op,
    value: rule.value,
    serve: rule.serve,
  };
}

async function loadDetail(db: Queryable, flag: Flag): Promise<FlagDetailJson> {
  const configs = await listFlagEnvConfigs(db, flag.id);
  const allRules = await listRules(db, flag.id);
  const envs = configs.map((config) =>
    toEnvJson(
      config,
      allRules.filter((rule) => rule.environmentId === config.environmentId),
    ),
  );
  return { ...toFlagJson(flag), envs };
}

function assertLive(flag: Flag): void {
  if (flag.archivedAt !== null) {
    throw new ConflictError("flag is archived");
  }
}

export async function createFlag(
  pool: Pool,
  ctx: MutationContext,
  input: CreateFlagInput,
  hooks?: MutationHooks,
): Promise<FlagDetailJson> {
  const key = parseFlagKey(input.key);
  const description = input.description ?? "";
  const clientFallback =
    input.client_fallback === undefined
      ? "fail_closed"
      : parseClientFallback(input.client_fallback);
  if (typeof input.default_value !== "boolean") {
    throw new ValidationError([{ path: "/default_value", message: "must be a boolean" }]);
  }

  const detail = await withTx(pool, async (tx) => {
    const flag = await insertFlag(tx, {
      projectId: ctx.projectId,
      key,
      description,
      defaultValue: input.default_value,
      clientFallback,
    });
    const environments = await listEnvironments(tx, ctx.projectId);
    for (const env of environments) {
      await insertFlagEnvConfig(tx, { flagId: flag.id, environmentId: env.id });
    }
    const created = await loadDetail(tx, flag);
    await insertAuditEvent(tx, {
      projectId: ctx.projectId,
      actorKeyId: ctx.actorKeyId,
      action: "flag.create",
      entityType: "flag",
      entityId: flag.id,
      beforeJson: null,
      afterJson: created,
      requestId: ctx.requestId,
    });
    return created;
  });
  await afterMutation(
    hooks,
    ctx.projectId,
    detail.envs.map((env) => env.key),
    "flag.create",
  );
  return detail;
}

export async function listFlags(
  pool: Pool,
  projectId: string,
  query: { includeArchived: boolean; limit: number; offset: number },
): Promise<FlagListJson> {
  const flags = await listFlagRows(pool, {
    projectId,
    includeArchived: query.includeArchived,
    limit: query.limit,
    offset: query.offset,
  });
  return {
    items: flags.map(toFlagJson),
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getFlag(
  pool: Pool,
  projectId: string,
  rawKey: string,
): Promise<FlagDetailJson> {
  const key = parseFlagKey(rawKey, "/key");
  const flag = await findFlagByKey(pool, projectId, key);
  if (!flag) throw new NotFoundError("flag", key);
  return loadDetail(pool, flag);
}

export async function patchFlag(
  pool: Pool,
  ctx: MutationContext,
  rawKey: string,
  input: PatchFlagInput,
  hooks?: MutationHooks,
): Promise<FlagDetailJson> {
  const key = parseFlagKey(rawKey, "/key");
  const { detail, mutated } = await withTx(pool, async (tx) => {
    const flag = await lockFlagByKey(tx, ctx.projectId, key);
    if (!flag) throw new NotFoundError("flag", key);
    assertLive(flag);

    const description = input.description ?? flag.description;
    const defaultValue = input.default_value ?? flag.defaultValue;
    const clientFallback =
      input.client_fallback === undefined
        ? flag.clientFallback
        : parseClientFallback(input.client_fallback);

    if (
      description === flag.description &&
      defaultValue === flag.defaultValue &&
      clientFallback === flag.clientFallback
    ) {
      return { detail: await loadDetail(tx, flag), mutated: false };
    }

    const before = await loadDetail(tx, flag);
    const updated = await updateFlagRow(tx, {
      id: flag.id,
      description,
      defaultValue,
      clientFallback,
    });
    const after = await loadDetail(tx, updated);
    await insertAuditEvent(tx, {
      projectId: ctx.projectId,
      actorKeyId: ctx.actorKeyId,
      action: "flag.update",
      entityType: "flag",
      entityId: flag.id,
      beforeJson: before,
      afterJson: after,
      requestId: ctx.requestId,
    });
    return { detail: after, mutated: true };
  });
  if (mutated) {
    await afterMutation(
      hooks,
      ctx.projectId,
      detail.envs.map((env) => env.key),
      "flag.update",
    );
  }
  return detail;
}

export async function archiveFlag(
  pool: Pool,
  ctx: MutationContext,
  rawKey: string,
  hooks?: MutationHooks,
): Promise<FlagDetailJson> {
  const key = parseFlagKey(rawKey, "/key");
  const detail = await withTx(pool, async (tx) => {
    const flag = await lockFlagByKey(tx, ctx.projectId, key);
    if (!flag) throw new NotFoundError("flag", key);
    assertLive(flag);
    const before = await loadDetail(tx, flag);
    const archived = await archiveFlagRow(tx, flag.id);
    const after = await loadDetail(tx, archived);
    await insertAuditEvent(tx, {
      projectId: ctx.projectId,
      actorKeyId: ctx.actorKeyId,
      action: "flag.archive",
      entityType: "flag",
      entityId: flag.id,
      beforeJson: before,
      afterJson: after,
      requestId: ctx.requestId,
    });
    return after;
  });
  await afterMutation(
    hooks,
    ctx.projectId,
    detail.envs.map((env) => env.key),
    "flag.archive",
  );
  return detail;
}

export async function putEnvConfig(
  pool: Pool,
  ctx: MutationContext,
  rawKey: string,
  rawEnv: string,
  input: PutEnvConfigInput,
  hooks?: MutationHooks,
): Promise<EnvConfigJson> {
  const key = parseFlagKey(rawKey, "/key");
  const percentage = parsePercentage(input.percentage);
  if (typeof input.enabled !== "boolean") {
    throw new ValidationError([{ path: "/enabled", message: "must be a boolean" }]);
  }
  const incoming = validateRules(input.rules);

  const { detail, mutated, envKey } = await withTx(pool, async (tx) => {
    const flag = await lockFlagByKey(tx, ctx.projectId, key);
    if (!flag) throw new NotFoundError("flag", key);
    assertLive(flag);

    const env = await findEnvironmentByKey(tx, ctx.projectId, rawEnv);
    if (!env) throw new NotFoundError("environment", rawEnv);

    const existingConfig = await findFlagEnvConfig(tx, flag.id, env.id);
    const existingRules = await listRules(tx, flag.id, env.id);
    const existingById = new Map(existingRules.map((rule) => [rule.id, rule]));

    incoming.forEach((rule, index) => {
      if (rule.id !== undefined && !existingById.has(rule.id)) {
        throw new ValidationError([
          { path: `/rules/${String(index)}/id`, message: "unknown rule id" },
        ]);
      }
    });

    const incomingIds = new Set(
      incoming.flatMap((rule) => (rule.id !== undefined ? [rule.id] : [])),
    );
    const deleted = existingRules.filter((rule) => !incomingIds.has(rule.id));
    const createdDrafts = incoming.filter((rule) => rule.id === undefined);
    const updatedDrafts = incoming.filter((rule) => {
      if (rule.id === undefined) return false;
      const before = existingById.get(rule.id);
      return before !== undefined && !rulesEqual(asValidated(before), rule);
    });

    const rulesChanged = deleted.length > 0 || createdDrafts.length > 0 || updatedDrafts.length > 0;

    if (
      existingConfig !== undefined &&
      !rulesChanged &&
      existingConfig.enabled === input.enabled &&
      existingConfig.percentage === percentage
    ) {
      return { detail: toEnvJson(existingConfig, existingRules), mutated: false, envKey: env.key };
    }

    const beforeEnv =
      existingConfig === undefined ? null : toEnvJson(existingConfig, existingRules);

    await deleteRulesForEnv(tx, flag.id, env.id);
    const stored: StoredRule[] = [];
    for (const rule of incoming) {
      stored.push(
        await insertRule(tx, {
          ...(rule.id !== undefined ? { id: rule.id } : {}),
          flagId: flag.id,
          environmentId: env.id,
          priority: rule.priority,
          attribute: rule.attribute,
          op: rule.op,
          value: rule.value,
          serve: rule.serve,
        }),
      );
    }
    const config = await upsertFlagEnvConfig(tx, {
      flagId: flag.id,
      environmentId: env.id,
      enabled: input.enabled,
      percentage,
    });
    const afterEnv = toEnvJson(config, stored);

    await insertAuditEvent(tx, {
      projectId: ctx.projectId,
      actorKeyId: ctx.actorKeyId,
      action: "env_config.update",
      entityType: "env_config",
      entityId: `${flag.key}:${env.key}`,
      beforeJson: beforeEnv,
      afterJson: afterEnv,
      requestId: ctx.requestId,
    });

    for (const rule of stored) {
      const before = existingById.get(rule.id);
      if (before === undefined) {
        await insertAuditEvent(tx, {
          projectId: ctx.projectId,
          actorKeyId: ctx.actorKeyId,
          action: "rule.create",
          entityType: "rule",
          entityId: rule.id,
          beforeJson: null,
          afterJson: toRuleJson(rule),
          requestId: ctx.requestId,
        });
      } else if (!rulesEqual(asValidated(before), asValidated(rule))) {
        await insertAuditEvent(tx, {
          projectId: ctx.projectId,
          actorKeyId: ctx.actorKeyId,
          action: "rule.update",
          entityType: "rule",
          entityId: rule.id,
          beforeJson: toRuleJson(before),
          afterJson: toRuleJson(rule),
          requestId: ctx.requestId,
        });
      }
    }
    for (const rule of deleted) {
      await insertAuditEvent(tx, {
        projectId: ctx.projectId,
        actorKeyId: ctx.actorKeyId,
        action: "rule.delete",
        entityType: "rule",
        entityId: rule.id,
        beforeJson: toRuleJson(rule),
        afterJson: null,
        requestId: ctx.requestId,
      });
    }

    return { detail: afterEnv, mutated: true, envKey: env.key };
  });
  if (mutated) {
    await afterMutation(hooks, ctx.projectId, [envKey], "env_config.update");
  }
  return detail;
}

export async function seedDemoFlags(pool: Pool, ctx: MutationContext): Promise<void> {
  const checkout = await findFlagByKey(pool, ctx.projectId, "checkout_v2");
  if (checkout === undefined) {
    await createFlag(pool, ctx, {
      key: "checkout_v2",
      description: "Checkout v2",
      default_value: false,
      client_fallback: "fail_closed",
    });
    await putEnvConfig(pool, ctx, "checkout_v2", "dev", {
      enabled: true,
      percentage: 50,
      rules: [
        {
          priority: 0,
          attribute: "user.plan",
          op: "eq",
          value: "pro",
          serve: true,
        },
      ],
    });
  }

  const kill = await findFlagByKey(pool, ctx.projectId, "kill_switch");
  if (kill === undefined) {
    await createFlag(pool, ctx, {
      key: "kill_switch",
      description: "Emergency kill switch",
      default_value: false,
      client_fallback: "fail_closed",
    });
  }
}
