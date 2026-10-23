# contracts

Golden request/response fixtures that gate merges (FR-EVAL-005, NFR-MAINT-002).

```
contracts/
  flags/               # admin flag/rule request+response examples
    <case>.json        # { "name", "request", "response" }
  evaluate/            # POST /v1/evaluate and /v1/evaluate-batch fixtures
    <case>.json        # { "name", "setup", "request", "response" }
  openapi/             # committed OpenAPI document (generated from route schemas)
```

Flag fixtures are validated against the route JSON schemas in `test/contract/`. Evaluate
fixtures (when present) load every case, run it against the Fastify app via `inject`, and
assert the response matches exactly. Required evaluate cases: kill switch, rule match,
percentage boundaries (bucket 0 and 99), missing attributes, archived, not_found, and batch
with a partial not_found.

Changing a fixture's expected response is an API change and requires an OpenSpec change.
