/**
 * Typed domain errors. Codes are stable, SCREAMING_SNAKE, and part of the public API contract;
 * never rename one without an OpenSpec change. HTTP status mapping lives in src/api/errors.ts.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
}

export interface FieldError {
  readonly path: string;
  readonly message: string;
}

export class ValidationError extends DomainError {
  readonly code = "VALIDATION_FAILED";
  constructor(
    readonly fields: readonly FieldError[],
    message = "Request validation failed",
  ) {
    super(message);
  }
}

export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND";
  constructor(
    readonly entity: string,
    readonly key: string,
  ) {
    super(`${entity} not found`);
  }
}

export class ConflictError extends DomainError {
  readonly code = "CONFLICT";
}
