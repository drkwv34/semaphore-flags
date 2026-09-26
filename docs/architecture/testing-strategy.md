# Testing strategy

Test the hard edges thoroughly (evaluate correctness, audit, invalidation, auth separation) and
skip coverage theater on glue code.

## Layers

| Layer       | Location                                         | Runs against                          | In CI                  |
| ----------- | ------------------------------------------------ | ------------------------------------- | ---------------------- |
| Unit        | `src/**/*.test.ts` (colocated)                   | pure functions, `app.inject`          | every push             |
| Contract    | `test/contract/` + `contracts/`                  | real Fastify app, in-memory snapshots | every push, merge gate |
| Integration | `test/integration/`                              | Postgres (+ Redis) service containers | every push             |
| Bench       | `bench/*.bench.ts` + `scripts/bench-evaluate.sh` | in-process / Compose                  | soft gate              |

Vitest projects: `unit`, `contract` (see `vitest.config.ts`); `integration` is added with the
first migration.

## Unit: evaluate goldens (NFR-REL-002)

- `contracts/evaluate/bucket-vectors.json`: at least ten `{ salt, flag_key, user_id, bucket }`
  entries, including a user with bucket `0` and one with bucket `99`. Generated once by an
  independent script (e.g. `openssl dgst -sha256`) and committed. **These values never change**;
  a diff here means bucketing broke.
- Algorithm table tests: one row per branch of FR-EVAL-002 (archived, not_found, disabled with a
  matching rule, rule_match, percentage boundaries 0/1/100, missing attribute).
- Predicate tests: every op × (match, no match, missing attribute, wrong type).
- Test names state the rule: `"disabled flag ignores matching rule and returns default"`.

## Contract tests (FR-EVAL-005, NFR-MAINT-002)

- Each fixture in `contracts/evaluate/*.json`:

  ```json
  {
    "name": "kill switch disabled in prod",
    "setup": { "salt": "fixture-salt", "flags": [ … compiled flag … ] },
    "request": { "method": "POST", "url": "/v1/evaluate", "body": { … } },
    "response": { "status": 200, "body": { "flag_key": "checkout_v2", "value": false, "reason": "disabled", "variant": "off" } }
  }
  ```

- The runner builds the app with an in-memory snapshot source seeded from `setup`, sends the
  request via `inject`, and asserts status and body with deep equality.
- Required fixtures: kill switch, rule match, percentage boundaries (bucket 0 and 99), missing
  attributes, archived, not_found, batch with partial not_found, 401 missing key, 403 wrong key
  type, 400 malformed body.
- OpenAPI: `contracts/openapi/openapi.json` is generated from route schemas; CI regenerates it and
  fails on diff. Every fixture response must validate against it.

## Integration

- Real Postgres 16 via the CI service container (or Compose locally); testcontainers optional.
- Each test file gets a fresh schema (`CREATE SCHEMA test_<random>` + migrate) so files run in
  parallel without cross-talk.
- Must-have scenarios: admin mutation → evaluate sees new value (cache on and off); audit row
  written in same tx (and absent when tx rolls back); `UPDATE audit_events` rejected by DB;
  Redis stopped → evaluate still 200; concurrent `POST /v1/flags` same key → one 201, one 409;
  SQL-injection strings in attrs are inert.

## Conventions

- Arrange / act / assert with blank lines between; one behavior per test.
- No mocking of the domain. Mock only at infrastructure ports (snapshot source, cache client).
- No sleeps; await explicit conditions.
- Tests must be deterministic: fixed salts, fixed ids, injected clock where time matters.
- A bug fix lands with a test that failed before the fix.

## CI gates (NFR-MAINT-001)

`lint → typecheck → unit → contract → integration → build → image`. The scaffold wires the
first steps with placeholders; each feature PR tightens the gate it touches. Contract tests are
a required status check once fixtures exist.
