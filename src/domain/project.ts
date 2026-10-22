import { ValidationError } from "./errors.js";

export const PROJECT_SLUG_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;

export const DEMO_PROJECT_SLUG = "demo";
export const DEMO_PROJECT_NAME = "Demo";

export function parseProjectSlug(raw: string): string {
  if (!PROJECT_SLUG_PATTERN.test(raw)) {
    throw new ValidationError([{ path: "/slug", message: "must match ^[a-z][a-z0-9-]{1,63}$" }]);
  }
  return raw;
}

export function parseProjectName(raw: string): string {
  const name = raw.trim();
  if (name.length < 1 || name.length > 100) {
    throw new ValidationError([{ path: "/name", message: "must be 1–100 characters" }]);
  }
  return name;
}
