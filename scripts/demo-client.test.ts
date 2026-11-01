import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  evaluateFlag,
  formatLine,
  parseEvaluateBody,
  resolveEvaluateKey,
  runDemoClient,
  valueFromFallback,
} from "./demo-client.js";

describe("demo-client fallback (FR-DOC-001)", () => {
  it("maps fail_closed to false and fail_open to true", () => {
    expect(valueFromFallback("fail_closed")).toBe(false);
    expect(valueFromFallback("fail_open")).toBe(true);
  });

  it("formats flag subject value reason", () => {
    expect(formatLine("kill_payments", "demo_in", false, "disabled")).toBe(
      "kill_payments demo_in false disabled",
    );
  });

  it("parses an evaluate 200 body", () => {
    expect(
      parseEvaluateBody({
        flag_key: "beta_ui",
        value: true,
        reason: "rule_match",
        variant: "on",
      }),
    ).toEqual({ flag_key: "beta_ui", value: true, reason: "rule_match" });
  });

  it("reads evaluate key from SEED_KEYS_PATH when env is empty", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "demo-client-keys-"));
    const filePath = path.join(dir, "demo-keys.json");
    await writeFile(
      filePath,
      JSON.stringify({ admin_key: "sf_admin_x", evaluate_key: "sf_eval_y" }),
      "utf8",
    );
    expect(resolveEvaluateKey({ SEED_KEYS_PATH: filePath })).toBe("sf_eval_y");
    expect(
      resolveEvaluateKey({ SEMAPHORE_EVALUATE_KEY: "sf_eval_env", SEED_KEYS_PATH: filePath }),
    ).toBe("sf_eval_env");
  });

  it("applies fail_closed on timeout or 5xx", async () => {
    const flag = { flag: "kill_payments", env: "prod", fallback: "fail_closed" as const };
    const timeout = await evaluateFlag({
      baseUrl: "http://flags.example",
      evaluateKey: "sf_eval_test",
      flag,
      subject: "demo_in",
      fetchImpl: () => Promise.reject(new Error("timeout")),
    });
    expect(timeout).toEqual({ value: false, reason: "client_fallback" });

    const serverError = await evaluateFlag({
      baseUrl: "http://flags.example",
      evaluateKey: "sf_eval_test",
      flag,
      subject: "demo_in",
      fetchImpl: () =>
        Promise.resolve(
          new Response("nope", { status: 503, headers: { "content-type": "text/plain" } }),
        ),
    });
    expect(serverError).toEqual({ value: false, reason: "client_fallback" });
  });

  it("prints server reason on 200", async () => {
    const lines = await runDemoClient({
      baseUrl: "http://flags.example",
      evaluateKey: "sf_eval_test",
      subjects: ["demo_in"],
      flags: [{ flag: "beta_ui", env: "staging", fallback: "fail_closed" }],
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              flag_key: "beta_ui",
              value: true,
              reason: "rule_match",
              variant: "on",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
      write: () => undefined,
    });
    expect(lines).toEqual(["beta_ui demo_in true rule_match"]);
  });
});
