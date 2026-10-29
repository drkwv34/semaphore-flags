# contracts

Golden request/response fixtures that gate merges (FR-EVAL-005, NFR-MAINT-002).

```
contracts/
  flags/               # admin flag/rule request+response examples
    <case>.json        # { "name", "request", "response" }
  evaluate/            # POST /v1/evaluate and /v1/evaluate-batch fixtures
    <case>.json        # { "name", "setup", "request", "response" }
  ops/                 # /healthz/deps (and related ops) fixtures
  openapi/             # committed OpenAPI document (generated from route schemas)
```

Flag fixtures are validated against the route JSON schemas in `test/contract/`. Evaluate
fixtures load every case, run the unit algorithm on `setup`, `inject` the HTTP request against
an in-memory snapshot source, and assert the response matches exactly. Required evaluate cases:
kill switch, rule match, percentage boundaries (bucket 0 and 99), percentage 0, missing
attributes, archived, not_found, batch with partial not_found, empty/oversize batch 400,
admin-key 403, missing-key 401. Audit fixtures cover the list item shape and evaluate-key 403.

`bucket-vectors.json` is the committed SHA-256 golden set (≥10 vectors, including buckets 0 and
99). Never edit existing vectors; a diff means bucketing broke.

Changing a fixture's expected response is an API change and requires an OpenSpec change.
