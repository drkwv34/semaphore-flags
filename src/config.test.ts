import { describe, expect, it } from "vitest";

import { ConfigError, loadConfig } from "./config.js";

const base = { DATABASE_URL: "postgres://semaphore:semaphore@localhost:5432/semaphore" };

describe("loadConfig", () => {
  it("applies defaults", () => {
    const config = loadConfig(base);
    expect(config.HTTP_ADDR).toEqual({ host: "0.0.0.0", port: 8080 });
    expect(config.LOG_LEVEL).toBe("info");
    expect(config.REDIS_URL).toBeUndefined();
  });

  it("treats blank REDIS_URL as cache disabled", () => {
    expect(loadConfig({ ...base, REDIS_URL: "" }).REDIS_URL).toBeUndefined();
  });

  it("fails fast on missing DATABASE_URL", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
  });

  it("rejects malformed HTTP_ADDR", () => {
    expect(() => loadConfig({ ...base, HTTP_ADDR: "8080" })).toThrow(/HTTP_ADDR/);
  });
});
