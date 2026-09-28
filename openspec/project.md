# Project context — semaphore-flags

> **Note:** Fission OpenSpec reads planning context from `openspec/config.yaml` (`context:`). This file
> is kept for backward-compatible links; edit `config.yaml` for agent-facing project context.

## Purpose

Feature-flag and kill-switch service: environments (dev/staging/prod), boolean flags with
percentage rollouts, attribute-based targeting, an immutable audit log, and an SDK-style HTTP
evaluate API. The value is in evaluation correctness, auditability, cache invalidation and
documented client fallback, not in feature breadth.

## Stack

- TypeScript (strict), Node.js 22 LTS, ESM
- Fastify 5 (HTTP edge), Zod (config + request validation)
- Postgres 16 (source of truth), Redis 7 (optional compiled-config cache)
- Vitest (unit + contract), OpenAPI 3 generated from route schemas
- Docker Compose, GitHub Actions, pnpm

## Conventions

The normative conventions live in `docs/architecture/` and `.cursor/rules/`. Summary:

- Layering: `api → domain ← store/cache/metrics`. Domain is pure and never imports outer layers.
- Evaluate hot path runs on compiled snapshot objects; no ORM hydration per request.
- Typed domain errors with stable codes, mapped to HTTP only in `src/api/errors.ts`.
- Missing flags on evaluate return `200 { value: false, reason: "not_found" }`, never 404.
- Every admin mutation writes its audit row in the same Postgres transaction and invalidates the
  cache before responding 2xx.
- Forward-only SQL migrations; audit rows are never updated or deleted.
- Conventional commits; branches `chore/…`, `feat/…`, `test/…`, `docs/…`.

## Out of scope

Multivariate variants, experimentation stats, streaming/native SDKs, rule-builder UI, admin SPA
as a Must, multi-region replication.

## Source documents

The SRS (`04-semaphore-flags-srs.md`) is the requirements baseline. Requirement ids (`FR-*`,
`NFR-*`) are cited in proposals and specs for traceability.
