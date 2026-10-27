# Proposal

## Why

Flag admin, targeting-rule writes, and audit are live, but `POST /v1/evaluate` still returns
501 after auth. Day 4 must replace that placeholder with the normative single-evaluate path so
clients can resolve a boolean from salt, flag key, and user id without reshuffling buckets
(FR-EVAL-001, FR-EVAL-002, FR-EVAL-004, FR-RULE-003, FR-ERR-001, NFR-REL-002, NFR-PERF-001,
NFR-SEC-001).

## What Changes

- Pure `evaluate` + SHA-256 hash bucket in `src/domain/evaluate` (FR-EVAL-002): missing flag →
  `not_found` / false; archived → `archived` / false; `enabled=false` kill switch → `disabled`
  serving `default_value`; first matching rule → `rule_match` / `rule.serve`; then
  `bucket < percentage` → `percentage_in` / true else `percentage_out` / false.
  `bucket = first_4_bytes_be(SHA256(project_salt + ":" + flag_key + ":" + user.id)) % 100`
  (inclusive 0..99). `variant` is `"on"` when `value` is true, else `"off"`. The reason enum
  stays `disabled | rule_match | percentage_in | percentage_out | default | archived | not_found`;
  `default` remains in the enum and is unused by this algorithm.
- Predicate evaluation in `src/domain/rules` (FR-RULE-003): ops as stored; missing attribute or
  incomparable type → false; never throw.
- Compiled per-`(project, env)` snapshot loaded from Postgres (no Redis this change). Compilation
  is a pure domain function over rows.
- `POST /v1/evaluate` (evaluate key only; admin key → 403): JSON body `{ flag_key, env, user }`;
  200 with `{ flag_key, value, reason, variant }` including `not_found` (FR-ERR-001). Malformed
  body → 400. Postgres unreachable → 503 `UNAVAILABLE`. Replaces the 501 placeholder.
- Golden bucket vectors (`contracts/evaluate/bucket-vectors.json`, ≥10 including 0 and 99,
  independently generated) and algorithm table tests. HTTP fixtures agree with the unit
  algorithm. Integration against Postgres covers every reason plus admin-key 403 and kill switch.
- Contract fixtures + route JSON schemas so the contract job stays green. Soft in-process
  microbench documented in README (not a CI fail). Compose smoke: evaluate kill-switch and one
  rule/percentage case.

Out of scope: `POST /v1/evaluate-batch` (FR-EVAL-003), `GET /v1/audit`, Redis cache or
invalidation, metrics scrape, multivariate experiments, admin SPA.

## Capabilities

### New Capabilities

- (none — reuse `evaluation` and `targeting-rules`)

### Modified Capabilities

- `evaluation`: replace the placeholder with single-evaluate HTTP, the FR-EVAL-002 algorithm,
  deterministic SHA-256 bucketing, the reason enum, and 200 `not_found` (FR-EVAL-001/002/004,
  FR-ERR-001, NFR-REL-002).
- `targeting-rules`: add runtime predicate evaluation (FR-RULE-003) that was deferred from
  `add-flags-rules-audit`.
- `projects-keys`: remove the authenticated 501 placeholder requirement; evaluate keys on
  `POST /v1/evaluate` now succeed past auth into the real path.

## Impact

- **Capabilities:** `evaluation`, `targeting-rules`, `projects-keys`.
- **Code paths:** `src/domain/evaluate/` (algorithm, hash, compile); `src/domain/rules/`
  (predicates); `src/store/` (snapshot load, parameterized); `src/services/` (evaluate use case);
  `src/api/` (evaluate route + schemas, drop 501 handler); `test/contract/`, `test/integration/`;
  `contracts/evaluate/`; README Compose smoke + bench note; architecture decision log.
- **APIs:** `POST /v1/evaluate` **BREAKING** vs the current 501 placeholder (authenticated
  evaluate keys receive 200 instead of 501). Request `{ flag_key, env, user: { id, attrs? } }`;
  response `{ flag_key, value, reason, variant }`.
- **Dependencies:** none new (`node:crypto` SHA-256 already available).
- **CI:** no job deleted, skipped, or loosened. Contract fixtures added under existing
  `pnpm test:contract`.
- **Docs:** README evaluate section, Compose curl for kill-switch + rule/percentage, soft
  microbench note; domain-model archived-vs-default question resolved as `false` + `archived`.
