import { describe, expect, it } from "vitest";

import { compileSnapshot, type SnapshotSource } from "../domain/evaluate/index.js";
import { ValidationError } from "../domain/errors.js";
import { EVALUATE_BATCH_MAX_KEYS, evaluateBatch } from "./evaluate.js";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function sourceWith(flags: Parameters<typeof compileSnapshot>[0]["flags"]): SnapshotSource {
  const snapshot = compileSnapshot({
    projectId: PROJECT_ID,
    env: "prod",
    salt: "fixture-salt",
    flags,
  });
  return {
    get(projectId, env) {
      if (projectId !== PROJECT_ID || env !== "prod") return Promise.resolve(undefined);
      return Promise.resolve(snapshot);
    },
  };
}

describe("evaluateBatch (FR-EVAL-003)", () => {
  const source = sourceWith([
    {
      key: "kill_switch",
      archived: false,
      defaultValue: false,
      enabled: false,
      percentage: 0,
      rules: [],
    },
  ]);

  it("rejects an empty flag_keys array", async () => {
    await expect(
      evaluateBatch(source, PROJECT_ID, { env: "prod", user: { id: "u1" }, flag_keys: [] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects 51 keys", async () => {
    const flag_keys = Array.from(
      { length: EVALUATE_BATCH_MAX_KEYS + 1 },
      (_, i) => `flag_${String(i)}`,
    );
    await expect(
      evaluateBatch(source, PROJECT_ID, { env: "prod", user: { id: "u1" }, flag_keys }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("accepts 50 keys and returns a map entry per distinct key", async () => {
    const flag_keys = Array.from(
      { length: EVALUATE_BATCH_MAX_KEYS },
      (_, i) => `flag_${String(i)}`,
    );
    const result = await evaluateBatch(source, PROJECT_ID, {
      env: "prod",
      user: { id: "u1" },
      flag_keys,
    });
    expect(Object.keys(result)).toHaveLength(EVALUATE_BATCH_MAX_KEYS);
    expect(result.flag_0).toMatchObject({ reason: "not_found", value: false });
  });

  it("collapses duplicate keys in the map", async () => {
    const result = await evaluateBatch(source, PROJECT_ID, {
      env: "prod",
      user: { id: "u1" },
      flag_keys: ["kill_switch", "kill_switch"],
    });
    expect(Object.keys(result)).toEqual(["kill_switch"]);
    expect(result.kill_switch).toEqual({
      flag_key: "kill_switch",
      value: false,
      reason: "disabled",
      variant: "off",
    });
  });

  it("rejects an invalid flag-key format", async () => {
    await expect(
      evaluateBatch(source, PROJECT_ID, {
        env: "prod",
        user: { id: "u1" },
        flag_keys: ["NOPE"],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
