# contracts

Golden request/response fixtures that gate merges (FR-EVAL-005, NFR-MAINT-002).

```
contracts/
  evaluate/            # POST /v1/evaluate and /v1/evaluate-batch fixtures
    <case>.json        # { "name", "setup", "request", "response" }
  openapi/             # committed OpenAPI document (generated from route schemas)
```

Fixtures are data, not code. `test/contract/` loads every fixture, runs it against the real
Fastify app (via `inject`), and asserts the response matches exactly. Required cases:
kill switch, rule match, percentage boundaries (bucket 0 and 99), missing attributes, archived,
not_found, and batch with a partial not_found.

Changing a fixture's expected response is an API change and requires an OpenSpec change.
