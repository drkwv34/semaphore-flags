# Domain model

The domain is small and must stay pure: plain TypeScript types plus functions. No classes with
hidden state, no framework types, no I/O. Everything here is deterministic and unit-testable
without mocks.

## Aggregates and entities

| Aggregate root  | Owns                                                | Key invariants                                                                                 |
| --------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `Project`       | `Environment[]`, `ApiKey[]`, `salt`                 | `slug` unique; env key matches `^[a-z][a-z0-9-]{1,31}$`; default envs `dev`, `staging`, `prod` |
| `Flag`          | `FlagEnvConfig` per environment, each with `Rule[]` | `key` matches `^[a-z][a-z0-9_]{1,63}$`, unique per project; `flag_type` is `boolean` only      |
| `FlagEnvConfig` | ordered `Rule[]`                                    | `percentage` integer 0–100; rule `priority` unique within the config                           |
| `AuditEvent`    | nothing (value, append-only)                        | never updated or deleted                                                                       |

`FlagEnvConfig` is mutated only through its parent `Flag`; services lock the flag row, not the
config row, so concurrent edits to different environments of the same flag serialize. That is
intentional: audit `before`/`after` snapshots stay coherent.

`ApiKey` stores `prefix` + `key_hash` only. Raw keys exist in memory once, at creation.

## Value types

Use branded string types for identifiers so they cannot be swapped by accident:

```ts
type Brand<T, B extends string> = T & { readonly __brand: B };
export type ProjectId = Brand<string, "ProjectId">;
export type FlagKey = Brand<string, "FlagKey">;
export type EnvKey = Brand<string, "EnvKey">;
```

Constructors (`parseFlagKey(raw): FlagKey | ValidationError`) live in the domain and are the
only way to produce a branded value.

Closed sets are `as const` arrays with a derived union (see `EVALUATION_REASONS`, `RULE_OPS`).
Never widen them to `string`. `switch` over them must be exhaustive (ESLint
`switch-exhaustiveness-check`).

## Rules

`Rule = { id, priority, attribute, op, value, serve }`.

- `attribute` addresses the evaluation context: `user.id` or `user.<attr>` (read from
  `user.attrs`).
- `op` ∈ `RULE_OPS`. `in` / `not_in` require a non-empty array; numeric ops compare numbers only
  (a string `"5"` does not satisfy `gt 4`); no implicit coercion.
- Missing attribute → predicate is `false` (FR-RULE-003). Predicates never throw.
- Rules are validated on write (admin path) so the hot path can trust them.

## Compiled snapshot (read model)

Evaluation never reads entities. It reads a `CompiledEnvSnapshot`, built once per
`(project_id, env)` and cached:

```ts
interface CompiledEnvSnapshot {
  readonly projectId: ProjectId;
  readonly env: EnvKey;
  readonly salt: string;
  readonly builtAt: string; // ISO-8601
  readonly flags: ReadonlyMap<FlagKey, CompiledFlag>;
}

interface CompiledFlag {
  readonly key: FlagKey;
  readonly archived: boolean;
  readonly defaultValue: boolean;
  readonly enabled: boolean;
  readonly percentage: number; // 0..100
  readonly rules: readonly CompiledRule[]; // pre-sorted by priority ascending
}
```

Compilation (entity rows → snapshot) is a pure function in `src/domain/evaluate`. The snapshot
is JSON-serializable for Redis (`flags` serialized as an array, rehydrated into a `Map`).

## Evaluation

`evaluate(flag: CompiledFlag | undefined, user: EvalUser, salt: string): EvalResult` implements
SRS FR-EVAL-002 exactly. It is the most important function in the repo:

- Pure and synchronous. No logging inside; callers log the returned `reason`.
- Returns a result for every input; unexpected shapes resolve to a safe `false`.
- Hash bucketing: `first_4_bytes_be(SHA256(salt + ":" + flag_key + ":" + user.id)) % 100`,
  rollout test `bucket < percentage`. Golden vectors are committed and must never change.

Open question for the evaluate-core proposal: FR-FLAG-004 says an archived flag serves
"default / false" while FR-EVAL-002 says `false`. The proposal must pick one and update the SRS
reference in the spec.

## Where logic goes

| Logic                                      | Location                    |
| ------------------------------------------ | --------------------------- |
| Shape validation of HTTP input             | Fastify schema in `src/api` |
| Invariants (key format, percentage, rules) | `src/domain`                |
| Cross-row checks (uniqueness, existence)   | DB constraints + `services` |
| Orchestration (tx, audit, cache)           | `src/services`              |
| SQL                                        | `src/store`                 |
