import { describe, expect, it } from "vitest";

import { ValidationError } from "./errors.js";
import {
  decodeAuditCursor,
  encodeAuditCursor,
  parseAuditAction,
  parseAuditEntityType,
  parseAuditLimit,
  parseIsoTimestamp,
} from "./audit.js";

describe("audit parsers (FR-AUD-003)", () => {
  it("round-trips a cursor", () => {
    const createdAt = new Date("2026-10-27T12:00:00.000Z");
    const id = "11111111-1111-4111-8111-111111111111";
    const cursor = encodeAuditCursor(createdAt, id);
    expect(decodeAuditCursor(cursor)).toEqual({ createdAt, id });
  });

  it("rejects an invalid cursor", () => {
    expect(() => decodeAuditCursor("not-a-cursor")).toThrow(ValidationError);
    expect(() => decodeAuditCursor("")).toThrow(ValidationError);
    expect(() => decodeAuditCursor(Buffer.from("no-pipe", "utf8").toString("base64url"))).toThrow(
      ValidationError,
    );
  });

  it("accepts closed-set filters and rejects unknown values", () => {
    expect(parseAuditAction("flag.create")).toBe("flag.create");
    expect(parseAuditEntityType("rule")).toBe("rule");
    expect(() => parseAuditAction("flag.delete")).toThrow(ValidationError);
    expect(() => parseAuditEntityType("project")).toThrow(ValidationError);
  });

  it("parses ISO timestamps and rejects junk", () => {
    expect(parseIsoTimestamp("2026-10-27T00:00:00.000Z", "/since").toISOString()).toBe(
      "2026-10-27T00:00:00.000Z",
    );
    expect(() => parseIsoTimestamp("yesterday", "/since")).toThrow(ValidationError);
  });

  it("defaults limit to 50 and caps at 200", () => {
    expect(parseAuditLimit(undefined)).toBe(50);
    expect(parseAuditLimit(1)).toBe(1);
    expect(parseAuditLimit(200)).toBe(200);
    expect(() => parseAuditLimit(0)).toThrow(ValidationError);
    expect(() => parseAuditLimit(201)).toThrow(ValidationError);
  });
});
