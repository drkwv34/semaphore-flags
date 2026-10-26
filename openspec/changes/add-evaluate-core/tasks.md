# Tasks

## 1. Domain: hash, predicates, algorithm

- [ ] 1.1 Implement `hashBucket` (SHA-256 first 4 bytes BE `% 100`) and commit `contracts/evaluate/bucket-vectors.json` (≥10 vectors, including 0 and 99, generated independently of `src/domain`) and verify colocated unit tests match every vector (FR-EVAL-002, NFR-REL-002)
- [ ] 1.2 Implement rule predicates (`eq neq in not_in contains gt gte lt lte`; `user.id` / `user.<attr>`; missing or wrong type → false; never throw) and verify a unit matrix of match / no-match / missing / wrong-type (FR-RULE-003)
- [ ] 1.3 Implement `compileSnapshot` and `evaluate` (FR-EVAL-002 order: not_found, archived/false, disabled/default_value, first rule_match, percentage_in/out; `variant` on/off) and verify a table test covering every branch plus percentage 0/1/100 and a matching rule ignored by kill switch (FR-EVAL-001, FR-EVAL-002)

## 2. Snapshot load and HTTP evaluate

- [ ] 2.1 Implement parameterized Postgres snapshot load and `SnapshotSource` (missing env → undefined) plus `evaluateFlag` use case (Postgres errors → `UnavailableError`) and verify integration can load a seeded flag into a compiled snapshot (NFR-SEC-002, FR-ERR-001)
- [ ] 2.2 Replace the 501 `POST /v1/evaluate` handler with JSON schemas, evaluate-key auth, and the real path (`flag_key`, `env`, `user`; 200 `{ flag_key, value, reason, variant }`) and verify integration: 200 for each reason, admin key 403, missing key 401, malformed 400, kill switch end-to-end (FR-EVAL-001, NFR-SEC-001, FR-ERR-001)

## 3. Contracts, bench, and docs

- [ ] 3.1 Add `contracts/evaluate/` HTTP fixtures (kill switch, rule match, percentage 0/99, missing attribute, archived, not_found, 403) whose expected bodies agree with the unit algorithm, plus a contract runner against exported JSON schemas, and verify `pnpm test:contract` stays green (FR-EVAL-004, NFR-MAINT-001)
- [ ] 3.2 Add `scripts/bench-evaluate.mjs` (in-process, ≤20 rules) and document evaluate request/response, SHA-256 formula, Compose curl smoke (kill-switch + rule or percentage), and the soft bench in README; record archived-vs-default in `docs/architecture/README.md`; verify the documented curl path matches 2.2 (NFR-PERF-001, NFR-MAINT-001)

## Verification

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:integration   # requires DATABASE_URL to Postgres 16
openspec validate add-evaluate-core --strict
docker compose up --build --wait
# copy admin + evaluate keys from `docker compose logs api`, then:
curl -sS -H "Authorization: Bearer $EVALUATE_KEY" -H "Content-Type: application/json" \
  -d '{"flag_key":"kill_switch","env":"prod","user":{"id":"u1"}}' \
  http://localhost:8080/v1/evaluate
curl -sS -H "Authorization: Bearer $EVALUATE_KEY" -H "Content-Type: application/json" \
  -d '{"flag_key":"checkout_v2","env":"dev","user":{"id":"u1","attrs":{"plan":"pro"}}}' \
  http://localhost:8080/v1/evaluate
```

## Workflow follow-up

- Open a ready PR from `feat/evaluate-core`; wait for all CI checks green on the PR head.
- Merge locally with `git merge --no-ff` as Christian Agila (never the GitHub merge button).
- Archive with `openspec archive add-evaluate-core --yes` as a direct commit on `main`.
