// Reference Compose client (FR-DOC-001). Not a shipped SDK.
// Timeout 150ms; on timeout/5xx/network error apply per-flag client_fallback.

import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

export type ClientFallback = "fail_closed" | "fail_open";

export interface DemoFlag {
  readonly flag: string;
  readonly env: string;
  readonly fallback: ClientFallback;
}

export interface EvaluateDecision {
  readonly flag_key: string;
  readonly value: boolean;
  readonly reason: string;
}

export const EVALUATE_TIMEOUT_MS = 150;

export const DEMO_FLAGS: readonly DemoFlag[] = [
  { flag: "kill_payments", env: "prod", fallback: "fail_closed" },
  { flag: "beta_ui", env: "staging", fallback: "fail_closed" },
];

export const NAMED_SUBJECTS: readonly string[] = ["demo_in", "demo_out"];

export function valueFromFallback(policy: ClientFallback): boolean {
  return policy === "fail_open";
}

export function formatLine(flag: string, subject: string, value: boolean, reason: string): string {
  return `${flag} ${subject} ${String(value)} ${reason}`;
}

export function parseEvaluateBody(body: unknown): EvaluateDecision | undefined {
  if (body === null || typeof body !== "object") return undefined;
  const rec = body as Record<string, unknown>;
  if (typeof rec.flag_key !== "string") return undefined;
  if (typeof rec.value !== "boolean") return undefined;
  if (typeof rec.reason !== "string") return undefined;
  return { flag_key: rec.flag_key, value: rec.value, reason: rec.reason };
}

export function resolveEvaluateKey(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.SEMAPHORE_EVALUATE_KEY?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
  const keysPath = env.SEED_KEYS_PATH?.trim();
  if (keysPath === undefined || keysPath.length === 0) {
    throw new Error("SEMAPHORE_EVALUATE_KEY is not set and SEED_KEYS_PATH is empty");
  }
  const parsed: unknown = JSON.parse(readFileSync(keysPath, "utf8"));
  if (parsed === null || typeof parsed !== "object") {
    throw new Error(`SEED_KEYS_PATH ${keysPath} is not a JSON object`);
  }
  const evaluateKey = (parsed as { evaluate_key?: unknown }).evaluate_key;
  if (typeof evaluateKey !== "string" || evaluateKey.length === 0) {
    throw new Error(`SEED_KEYS_PATH ${keysPath} has no evaluate_key`);
  }
  return evaluateKey;
}

export function demoSubjects(randomCount = 24): string[] {
  const random = Array.from({ length: randomCount }, () => `rnd_${randomBytes(4).toString("hex")}`);
  return [...NAMED_SUBJECTS, ...random];
}

export async function evaluateFlag(input: {
  readonly baseUrl: string;
  readonly evaluateKey: string;
  readonly flag: DemoFlag;
  readonly subject: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}): Promise<{ value: boolean; reason: string }> {
  const timeoutMs = input.timeoutMs ?? EVALUATE_TIMEOUT_MS;
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${input.baseUrl.replace(/\/$/, "")}/v1/evaluate`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.evaluateKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        flag_key: input.flag.flag,
        env: input.flag.env,
        user: { id: input.subject },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status >= 500) {
      return {
        value: valueFromFallback(input.flag.fallback),
        reason: "client_fallback",
      };
    }
    if (!res.ok) {
      return {
        value: valueFromFallback(input.flag.fallback),
        reason: "client_fallback",
      };
    }
    const parsed = parseEvaluateBody(await res.json());
    if (parsed === undefined) {
      return {
        value: valueFromFallback(input.flag.fallback),
        reason: "client_fallback",
      };
    }
    return { value: parsed.value, reason: parsed.reason };
  } catch {
    return {
      value: valueFromFallback(input.flag.fallback),
      reason: "client_fallback",
    };
  }
}

export async function runDemoClient(input: {
  readonly baseUrl: string;
  readonly evaluateKey: string;
  readonly subjects?: readonly string[];
  readonly flags?: readonly DemoFlag[];
  readonly fetchImpl?: typeof fetch;
  readonly write?: (line: string) => void;
}): Promise<string[]> {
  const subjects = input.subjects ?? demoSubjects();
  const flags = input.flags ?? DEMO_FLAGS;
  const write = input.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const lines: string[] = [];
  for (const flag of flags) {
    for (const subject of subjects) {
      const result = await evaluateFlag({
        baseUrl: input.baseUrl,
        evaluateKey: input.evaluateKey,
        flag,
        subject,
        ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {}),
      });
      const line = formatLine(flag.flag, subject, result.value, result.reason);
      lines.push(line);
      write(line);
    }
  }
  return lines;
}

function isMain(): boolean {
  const entry = process.argv[1];
  return (
    entry !== undefined && (entry.endsWith("/demo-client.ts") || entry.endsWith("/demo-client.js"))
  );
}

async function main(): Promise<number> {
  const baseUrl = process.env.SEMAPHORE_URL?.trim() || "http://localhost:8080";
  let evaluateKey: string | undefined;
  let lastError = "SEMAPHORE_EVALUATE_KEY is not set";
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      evaluateKey = resolveEvaluateKey();
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (evaluateKey === undefined) {
    process.stderr.write(`demo-client: ${lastError}\n`);
    return 1;
  }
  await runDemoClient({ baseUrl, evaluateKey });
  return 0;
}

if (isMain()) {
  void main().then(
    (code) => {
      if (code !== 0) process.exit(code);
    },
    (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`demo-client: ${message}\n`);
      process.exit(1);
    },
  );
}
