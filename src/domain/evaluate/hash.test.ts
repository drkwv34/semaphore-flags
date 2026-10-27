import { describe, expect, it } from "vitest";

import vectorsJson from "../../../contracts/evaluate/bucket-vectors.json" with { type: "json" };

import { hashBucket } from "./index.js";

interface Vector {
  salt: string;
  flag_key: string;
  user_id: string;
  bucket: number;
}

const vectors = vectorsJson as Vector[];

describe("hashBucket (FR-EVAL-002, NFR-REL-002)", () => {
  it("has at least ten golden vectors including buckets 0 and 99", () => {
    expect(vectors.length).toBeGreaterThanOrEqual(10);
    expect(vectors.some((v) => v.bucket === 0)).toBe(true);
    expect(vectors.some((v) => v.bucket === 99)).toBe(true);
  });

  it.each(vectors)(
    "matches $salt:$flag_key:$user_id → $bucket",
    ({ salt, flag_key, user_id, bucket }) => {
      expect(hashBucket(salt, flag_key, user_id)).toBe(bucket);
    },
  );

  it("is stable for the same salt, key, and id", () => {
    const a = hashBucket("fixture-salt", "checkout_v2", "user-alpha");
    const b = hashBucket("fixture-salt", "checkout_v2", "user-alpha");
    expect(a).toBe(b);
    expect(a).toBe(42);
  });
});
