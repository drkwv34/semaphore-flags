import { describe, expect, it } from "vitest";

import { ValidationError } from "./errors.js";
import { parseProjectName, parseProjectSlug } from "./project.js";

describe("parseProjectSlug", () => {
  it("accepts demo and kebab slugs", () => {
    expect(parseProjectSlug("demo")).toBe("demo");
    expect(parseProjectSlug("acme-app")).toBe("acme-app");
  });

  it("rejects invalid slugs", () => {
    expect(() => parseProjectSlug("Demo")).toThrow(ValidationError);
    expect(() => parseProjectSlug("x")).toThrow(ValidationError);
  });
});

describe("parseProjectName", () => {
  it("trims a valid name", () => {
    expect(parseProjectName("  Acme  ")).toBe("Acme");
  });

  it("rejects empty and oversized names", () => {
    expect(() => parseProjectName("   ")).toThrow(ValidationError);
    expect(() => parseProjectName("a".repeat(101))).toThrow(ValidationError);
  });
});
