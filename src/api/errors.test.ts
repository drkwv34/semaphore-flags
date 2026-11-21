import { describe, expect, it } from "vitest";

import { ConflictError, NotFoundError, ValidationError } from "../domain/errors.js";
import { mintApiKey } from "../services/api-keys.js";
import type { Pool } from "../store/index.js";
import { buildApp } from "./app.js";
import {
  ForbiddenError,
  NotImplementedError,
  UnauthorizedError,
  UnavailableError,
  mapError,
} from "./errors.js";

function connectionError(code: string, message: string): NodeJS.ErrnoException {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  return err;
}

describe("mapError", () => {
  it.each([
    [new ValidationError([{ path: "/key", message: "required" }]), 400, "VALIDATION_FAILED"],
    [new UnauthorizedError(), 401, "UNAUTHORIZED"],
    [new ForbiddenError(), 403, "FORBIDDEN"],
    [new NotFoundError("flag", "beta_ui"), 404, "NOT_FOUND"],
    [new ConflictError("flag key taken"), 409, "CONFLICT"],
    [new NotImplementedError(), 501, "NOT_IMPLEMENTED"],
    [new UnavailableError(), 503, "UNAVAILABLE"],
    [new Error("db exploded: password=hunter2"), 500, "INTERNAL"],
  ])("maps %o to %i %s", (err, status, code) => {
    const mapped = mapError(err);
    expect(mapped.status).toBe(status);
    expect(mapped.code).toBe(code);
  });

  it("never leaks internal messages on 500", () => {
    expect(mapError(new Error("secret detail")).message).toBe("Internal server error");
  });

  it.each([
    connectionError("ENOTFOUND", "getaddrinfo ENOTFOUND db"),
    connectionError("ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:5432"),
    connectionError("ECONNRESET", "read ECONNRESET"),
    new Error("Connection terminated unexpectedly"),
    new Error("timeout exceeded when trying to connect"),
  ])("maps postgres connection error %s to 503 UNAVAILABLE", (err) => {
    const mapped = mapError(err);
    expect(mapped.status).toBe(503);
    expect(mapped.code).toBe("UNAVAILABLE");
    expect(mapped.message).not.toMatch(/ECONN|password|5432/i);
  });
});

describe("postgres connection errors on product routes", () => {
  it("returns 503 UNAVAILABLE on evaluate and current project and logs warn", async () => {
    const evalKey = mintApiKey("evaluate");
    const adminKey = mintApiKey("admin");
    const failingPool = {
      query: () =>
        Promise.reject(connectionError("ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:5432")),
      connect: () =>
        Promise.reject(connectionError("ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:5432")),
      end: () => Promise.resolve(),
    } as unknown as Pool;
    const chunks: string[] = [];
    const app = await buildApp(
      { NODE_ENV: "test", LOG_LEVEL: "warn" },
      { pool: failingPool, logDestination: { write: (chunk) => chunks.push(chunk) } },
    );

    const evaluate = await app.inject({
      method: "POST",
      url: "/v1/evaluate",
      headers: {
        authorization: `Bearer ${evalKey.raw}`,
        "content-type": "application/json",
      },
      payload: { flag_key: "checkout_v2", env: "prod", user: { id: "u1" } },
    });
    expect(evaluate.statusCode).toBe(503);
    expect(evaluate.json()).toMatchObject({ error: { code: "UNAVAILABLE" } });

    const current = await app.inject({
      method: "GET",
      url: "/v1/projects/current",
      headers: { authorization: `Bearer ${adminKey.raw}` },
    });
    expect(current.statusCode).toBe(503);
    expect(current.json()).toMatchObject({ error: { code: "UNAVAILABLE" } });

    const healthz = await app.inject({ method: "GET", url: "/healthz" });
    expect(healthz.statusCode).toBe(200);
    const readyz = await app.inject({ method: "GET", url: "/readyz" });
    expect(readyz.statusCode).toBe(503);

    const joined = chunks.join("");
    expect(joined).toMatch(/"level":40/);
    expect(joined).not.toMatch(/"level":50/);
    await app.close();
  });
});

describe("error envelope", () => {
  it("returns the structured body with request_id", async () => {
    const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" });
    app.get("/boom", () => {
      throw new ValidationError([{ path: "/key", message: "required" }]);
    });

    const res = await app.inject({
      method: "GET",
      url: "/boom",
      headers: { "x-request-id": "r-1" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.headers["x-request-id"]).toBe("r-1");
    expect(res.json()).toEqual({
      error: {
        code: "VALIDATION_FAILED",
        message: "Request validation failed",
        request_id: "r-1",
        fields: [{ path: "/key", message: "required" }],
      },
    });
    await app.close();
  });

  it("returns NOT_FOUND envelope from the not-found handler", async () => {
    const app = await buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" });
    const res = await app.inject({
      method: "GET",
      url: "/no-such",
      headers: { "x-request-id": "r-404" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.headers["x-request-id"]).toBe("r-404");
    expect(res.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
        request_id: "r-404",
      },
    });
    await app.close();
  });
});
