# Spec Delta

## REMOVED Requirements

### Requirement: Evaluate placeholder after auth

**Reason**: `POST /v1/evaluate` now implements the normative algorithm; a 501 after a valid evaluate key would be incorrect.

**Migration**: Authenticated evaluate keys receive 200 with `{ value, reason, variant }` as specified by the `evaluation` capability. Admin keys on that route remain 403 `FORBIDDEN`.
