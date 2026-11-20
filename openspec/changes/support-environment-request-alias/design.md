# Design

## Context

See `proposal.md` for motivation. Fastify JSON schemas require `env` on evaluate and
evaluate-batch (`additionalProperties: false`). SRS samples use `environment`. Golden fixtures
and README curls use `env`. Hashing uses the env key only as a snapshot lookup; the field name
must not change buckets.

## Goals / Non-Goals

**Goals:**

- `environment` works as alias of `env` on single and batch.
- Explicit conflict/neither/invalid-type 400s.
- Keep `env` clients, response JSON, and existing goldens.

**Non-Goals:**

- Silent preference of one field when they differ.
- Rewriting the SRS or renaming response fields.
- Changing `POST /v1/environments` (admin create).

## Decisions

### 1. Schema allows both; use case normalizes

- **Choice:** Add optional string `environment` next to optional string `env`. Drop `env` from
  JSON-schema `required` (keep `flag_key`/`user` or `user`/`flag_keys`). Fastify still rejects
  wrong types and unknown properties. `resolveEvaluateEnv` in `src/services/evaluate.ts` (pure,
  no I/O) picks the value: one present → that string; both equal → that string; both differ →
  `ValidationError` with `fields` on `/env` and `/environment`; neither → `ValidationError`
  with `fields` on both paths. Then existing `parseEnvKey`.
- **Why:** Equality of two string values is not expressible as a useful AJV error for clients
  that branch on `fields`. Domain stays unaware of HTTP field names.
- **Alternative:** JSON Schema `oneOf` env XOR environment. Rejected: both-equal would 400, but
  the brief requires both-equal 200.
- **Alternative:** Normalize in the handler only. Rejected: batch and single would fork;
  services already parse `env`.

### 2. Do not choose silently when they differ

- **Choice:** 400 `VALIDATION_FAILED` with both paths in `fields`. Never pick `env` or
  `environment` when they disagree.
- **Why:** Brief decision 6. Silent choice would hide client bugs and change no hash, but it
  would surprise Appendix D vs internal clients.

### 3. New fixtures; do not edit goldens

- **Choice:** Add `contracts/evaluate/` files for `environment` 200 (single and batch matching
  an existing `env` expected body), both-equal 200, both-different 400, neither 400. Leave
  `bucket-vectors.json` and current `env` fixtures byte-stable. Document both field names in
  OpenAPI property descriptions, README, and `docs/contracts.md`.
- **Why:** FR-EVAL-004 goldens are a merge gate; changing expected bodies is an API change
  unrelated to the alias.

## Risks / Trade-offs

- [OpenAPI shows `env` optional] → Descriptions state at least one of `env`/`environment` is
  required. Runtime still 400 if neither.
- [Auth still 401 before body alias] → `preValidation` auth unchanged; missing key stays 401
  even if `environment` is used.

## Migration Plan

Ship additive request field. Old `env` clients unchanged. Rollback removes `environment` and
restores required `env`.

## Open Questions

None.
