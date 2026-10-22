import { ConflictError, ValidationError } from "../domain/errors.js";

interface PgErrorLike {
  readonly code?: string;
}

function isPgError(err: unknown): err is PgErrorLike {
  return typeof err === "object" && err !== null && "code" in err;
}

export function translatePgError(err: unknown): never {
  if (isPgError(err) && err.code === "23505") {
    throw new ConflictError("unique constraint violated");
  }
  if (isPgError(err) && err.code === "23514") {
    throw new ValidationError([{ path: "/", message: "check constraint violated" }]);
  }
  throw err;
}
