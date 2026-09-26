import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

import {
  ConflictError,
  DomainError,
  type FieldError,
  NotFoundError,
  ValidationError,
} from "../domain/errors.js";

export class UnauthorizedError extends DomainError {
  readonly code = "UNAUTHORIZED";
  constructor(message = "Missing or invalid API key") {
    super(message);
  }
}

export class ForbiddenError extends DomainError {
  readonly code = "FORBIDDEN";
  constructor(message = "API key type not allowed for this route") {
    super(message);
  }
}

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    request_id: string;
    fields?: readonly FieldError[];
  };
}

interface Mapped {
  status: number;
  code: string;
  message: string;
  fields?: readonly FieldError[];
}

function isFastifyError(err: unknown): err is FastifyError {
  return err instanceof Error && "code" in err && typeof err.code === "string";
}

export function mapError(err: unknown): Mapped {
  if (err instanceof ValidationError) {
    return { status: 400, code: err.code, message: err.message, fields: err.fields };
  }
  if (err instanceof UnauthorizedError)
    return { status: 401, code: err.code, message: err.message };
  if (err instanceof ForbiddenError) return { status: 403, code: err.code, message: err.message };
  if (err instanceof NotFoundError) return { status: 404, code: err.code, message: err.message };
  if (err instanceof ConflictError) return { status: 409, code: err.code, message: err.message };

  if (isFastifyError(err) && err.validation) {
    return {
      status: 400,
      code: "VALIDATION_FAILED",
      message: "Request validation failed",
      fields: err.validation.map((v) => ({
        path: v.instancePath || "/",
        message: v.message ?? "invalid",
      })),
    };
  }
  if (isFastifyError(err) && err.statusCode !== undefined && err.statusCode < 500) {
    return { status: err.statusCode, code: "INVALID_REQUEST", message: err.message };
  }

  // Unknown errors never leak internals to the client.
  return { status: 500, code: "INTERNAL", message: "Internal server error" };
}

export function errorHandler(err: unknown, request: FastifyRequest, reply: FastifyReply): void {
  const mapped = mapError(err);
  if (mapped.status >= 500) {
    request.log.error({ err }, "unhandled error");
  } else {
    request.log.info({ code: mapped.code, status: mapped.status }, "request rejected");
  }
  const body: ErrorBody = {
    error: {
      code: mapped.code,
      message: mapped.message,
      request_id: request.id,
      ...(mapped.fields ? { fields: mapped.fields } : {}),
    },
  };
  void reply.status(mapped.status).send(body);
}
