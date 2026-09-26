import { describe, expect, it } from "vitest";

import { ConflictError, NotFoundError, ValidationError } from "../domain/errors.js";
import { buildApp } from "./app.js";
import { ForbiddenError, UnauthorizedError, mapError } from "./errors.js";

describe("mapError", () => {
  it.each([
    [new ValidationError([{ path: "/key", message: "required" }]), 400, "VALIDATION_FAILED"],
    [new UnauthorizedError(), 401, "UNAUTHORIZED"],
    [new ForbiddenError(), 403, "FORBIDDEN"],
    [new NotFoundError("flag", "beta_ui"), 404, "NOT_FOUND"],
    [new ConflictError("flag key taken"), 409, "CONFLICT"],
    [new Error("db exploded: password=hunter2"), 500, "INTERNAL"],
  ])("maps %o to %i %s", (err, status, code) => {
    const mapped = mapError(err);
    expect(mapped.status).toBe(status);
    expect(mapped.code).toBe(code);
  });

  it("never leaks internal messages on 500", () => {
    expect(mapError(new Error("secret detail")).message).toBe("Internal server error");
  });
});

describe("error envelope", () => {
  it("returns the structured body with request_id", async () => {
    const app = buildApp({ NODE_ENV: "test", LOG_LEVEL: "info" });
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
});
