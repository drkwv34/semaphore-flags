export const AUDIT_ACTIONS = [
  "flag.create",
  "flag.update",
  "flag.archive",
  "env_config.update",
  "rule.create",
  "rule.update",
  "rule.delete",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITY_TYPES = ["flag", "env_config", "rule"] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];
