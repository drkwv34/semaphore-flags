import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Ajv, type AnySchema, type ErrorObject, type ValidateFunction } from "ajv";

const committedPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../contracts/openapi/openapi.json",
);

export const VOLATILE_KEYS = ["request_id", "created_at", "updated_at"] as const;

interface OpenApiDoc {
  readonly paths?: Record<string, Record<string, unknown>>;
  readonly components?: { readonly schemas?: Record<string, unknown> };
}

let cachedDoc: OpenApiDoc | undefined;

export async function loadOpenApiDocument(): Promise<OpenApiDoc> {
  cachedDoc ??= JSON.parse(await readFile(committedPath, "utf8")) as OpenApiDoc;
  return cachedDoc;
}

export function stripVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if ((VOLATILE_KEYS as readonly string[]).includes(key)) continue;
      out[key] = stripVolatile(nested);
    }
    return out;
  }
  return value;
}

function matchPath(pattern: string, url: string): boolean {
  const pathname = (url.split("?")[0] ?? url).replace(/\/$/, "") || "/";
  const patternPath = pattern.replace(/\/$/, "") || "/";
  const patternParts = patternPath.split("/");
  const urlParts = pathname.split("/");
  if (patternParts.length !== urlParts.length) return false;
  return patternParts.every((part, i) => {
    const actual = urlParts[i];
    return part.startsWith("{") || part === actual;
  });
}

function lookupSchema(
  doc: OpenApiDoc,
  method: string,
  url: string,
  status: number,
): { mediaType: string; schema: unknown } | undefined {
  const paths = doc.paths ?? {};
  const pathKey = Object.keys(paths).find((candidate) => matchPath(candidate, url));
  if (pathKey === undefined) return undefined;
  const item = paths[pathKey];
  if (item === undefined) return undefined;
  const operation = item[method.toLowerCase()] as
    { responses?: Record<string, unknown> } | undefined;
  const responses = operation?.responses;
  if (responses === undefined) return undefined;
  const response = (responses[String(status)] ?? responses.default) as
    | {
        content?: Record<string, { schema?: unknown }>;
        schema?: unknown;
      }
    | undefined;
  if (response === undefined) return undefined;
  const content = response.content;
  if (content !== undefined) {
    const json = content["application/json"];
    if (json?.schema !== undefined) return { mediaType: "application/json", schema: json.schema };
    const plain = content["text/plain"];
    if (plain?.schema !== undefined) return { mediaType: "text/plain", schema: plain.schema };
    const first = Object.entries(content)[0];
    if (first?.[1]?.schema !== undefined) return { mediaType: first[0], schema: first[1].schema };
  }
  if (response.schema !== undefined)
    return { mediaType: "application/json", schema: response.schema };
  return undefined;
}

function resolveRef(doc: OpenApiDoc, schema: unknown, seen = new Set<string>()): unknown {
  if (Array.isArray(schema)) return schema.map((item) => resolveRef(doc, item, seen));
  if (schema === null || typeof schema !== "object") return schema;
  const rec = schema as Record<string, unknown>;
  const ref = rec.$ref;
  if (typeof ref === "string") {
    if (seen.has(ref)) return schema;
    seen.add(ref);
    if (!ref.startsWith("#/")) return schema;
    let current: unknown = doc;
    for (const part of ref.slice(2).split("/")) {
      if (current === null || typeof current !== "object") return schema;
      current = (current as Record<string, unknown>)[part];
    }
    return resolveRef(doc, current, seen);
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rec)) {
    out[key] = resolveRef(doc, value, seen);
  }
  return out;
}

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  validateSchema: false,
  coerceTypes: false,
});

const compiled = new Map<string, ValidateFunction>();

function formatErrors(errors: ErrorObject[] | null | undefined): string {
  if (errors === undefined || errors === null || errors.length === 0) return "unknown schema error";
  return errors.map((err) => `${err.instancePath || "/"} ${err.message ?? "invalid"}`).join("; ");
}

export async function assertConformsToOpenApi(input: {
  method: string;
  url: string;
  status: number;
  body: unknown;
  contentType?: string | undefined;
}): Promise<void> {
  const doc = await loadOpenApiDocument();
  const found = lookupSchema(doc, input.method, input.url, input.status);
  if (found === undefined) {
    throw new Error(
      `OpenAPI has no schema for ${input.method.toUpperCase()} ${input.url} → ${String(input.status)}`,
    );
  }
  if (found.mediaType.startsWith("text/plain")) {
    if (typeof input.body !== "string") {
      throw new Error(`expected text/plain body for ${input.url}, got ${typeof input.body}`);
    }
    if (input.contentType !== undefined && !input.contentType.includes("text/plain")) {
      throw new Error(
        `expected text/plain content-type for ${input.url}, got ${input.contentType}`,
      );
    }
    return;
  }
  const key = `${input.method}:${input.url}:${String(input.status)}`;
  let validate = compiled.get(key);
  if (validate === undefined) {
    const schema = resolveRef(doc, found.schema);
    if (schema === null || typeof schema !== "object") {
      throw new Error(`OpenAPI schema for ${key} is not an object`);
    }
    validate = ajv.compile(schema as AnySchema);
    compiled.set(key, validate);
  }
  const check = validate;
  if (!check(input.body)) {
    throw new Error(
      `${input.method.toUpperCase()} ${input.url} ${String(input.status)} failed OpenAPI validation: ${formatErrors(check.errors)}`,
    );
  }
}
