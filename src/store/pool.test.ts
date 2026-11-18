import { describe, expect, it } from "vitest";

import { createPool, type PoolErrorLog } from "./pool.js";

describe("createPool idle error (FR-OPS-001)", () => {
  it("does not throw when an idle client error is emitted and omits credentials from the log", async () => {
    const lines: { obj: Record<string, unknown>; msg: string }[] = [];
    const log: PoolErrorLog = {
      warn(obj, msg) {
        lines.push({ obj, msg });
      },
    };
    const databaseUrl = "postgres://semaphore:s3cret-pass@127.0.0.1:1/semaphore";
    const pool = createPool(databaseUrl, undefined, log);
    const boom = new Error(`connect ECONNRESET ${databaseUrl}`);
    (boom as Error & { code: string }).code = "ECONNRESET";

    expect(() => {
      pool.emit("error", boom);
    }).not.toThrow();

    expect(lines).toHaveLength(1);
    const dumped = JSON.stringify(lines[0]);
    expect(dumped).not.toContain("s3cret-pass");
    expect(dumped).not.toContain(databaseUrl);
    expect(lines[0]?.obj).toEqual({ err_name: "Error", err_code: "ECONNRESET" });
    expect(lines[0]?.obj).not.toHaveProperty("message");
    expect(lines[0]?.msg).toBe("postgres pool idle client error");

    await pool.end();
  });

  it("registers an error listener on a newly created pool", async () => {
    const pool = createPool("postgres://semaphore:semaphore@127.0.0.1:1/semaphore");
    expect(pool.listenerCount("error")).toBeGreaterThan(0);
    await pool.end();
  });
});
