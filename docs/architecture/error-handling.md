# Error handling

## Principles

1. **Expected outcomes are values, not exceptions**, on the evaluate path. A missing flag is
   `reason: "not_found"`; a missing attribute is a non-matching predicate. The evaluate
   algorithm cannot throw.
2. **Admin-path failures are typed errors** extending `DomainError` (`src/domain/errors.ts`),
   each with a stable `code`.
3. **HTTP mapping happens once**, in `src/api/errors.ts` (`mapError` + `errorHandler`). Nothing
   else sets error status codes.
4. **Unknown errors are 500 with a generic message.** The real error is logged with the
   `request_id`; the client never sees stack traces, SQL or driver messages.

## Error catalog

| Error class         | `code`              | HTTP | When                                                      |
| ------------------- | ------------------- | ---- | --------------------------------------------------------- |
| `ValidationError`   | `VALIDATION_FAILED` | 400  | Schema or invariant failure; carries `fields[]`           |
| `UnauthorizedError` | `UNAUTHORIZED`      | 401  | Missing, malformed, unknown or revoked key                |
| `ForbiddenError`    | `FORBIDDEN`         | 403  | Valid key of the wrong type (evaluate key on admin route) |
| `NotFoundError`     | `NOT_FOUND`         | 404  | Admin route addressing a missing entity                   |
| `ConflictError`     | `CONFLICT`          | 409  | Unique violation (flag key, env key, rule priority)       |
| Fastify 4xx         | `INVALID_REQUEST`   | 4xx  | Unsupported media type, body too large, bad JSON          |
| anything else       | `INTERNAL`          | 500  | Bug or dependency failure                                 |

Planned, added with the proposal that needs them: `UNAVAILABLE` (503, Postgres unreachable and
no cached snapshot), `RATE_LIMITED` (429, only if a rate-limit proposal is approved).

More specific codes (e.g. `FLAG_KEY_TAKEN`) may subclass a base error but must keep its HTTP
status. Codes are API surface: adding one needs an OpenSpec delta; renaming one is **BREAKING**.

## Response envelope

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed",
    "request_id": "0b6c…",
    "fields": [{ "path": "/percentage", "message": "must be <= 100" }]
  }
}
```

`fields` appears only for validation errors. `message` is human-readable and may change;
clients branch on `code`.

## Evaluate-specific rules

- Missing flag → `200 { value: false, reason: "not_found" }` (FR-EVAL-001). Batch returns a
  `not_found` entry per missing key; the batch as a whole still succeeds.
- Malformed body → 400. Auth failures → 401/403.
- Redis failure → not an error. Log `warn`, fall back to Postgres.
- Postgres failure with no cached snapshot → 503 `UNAVAILABLE`; clients apply
  `client_fallback` (see `integrations.md`).

## Translating infrastructure errors

`src/store` translates driver errors into domain errors at the repository boundary:

| Postgres SQLSTATE | Becomes                                                            |
| ----------------- | ------------------------------------------------------------------ |
| `23505` unique    | `ConflictError`                                                    |
| `23503` FK        | `NotFoundError` or `ConflictError` depending on the side           |
| `23514` check     | `ValidationError` (defense in depth; domain should have caught it) |
| other             | rethrown as-is → 500                                               |

Never `catch` and swallow. If a `catch` does not rethrow, it must log and record why the error
is safe to ignore (e.g. cache delete failure).

## Logging errors

- 5xx: `error` level with the full `err` object.
- 4xx: `info` level with `code` and `status` only; no request body.
- Expected degradations (Redis down): `warn`, rate-limited to avoid log floods.
