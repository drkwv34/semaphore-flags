import { z } from "zod";

const HttpAddr = z
  .string()
  .regex(/^[^:]+:\d{1,5}$/, "expected host:port")
  .transform((value) => {
    const idx = value.lastIndexOf(":");
    return { host: value.slice(0, idx), port: Number(value.slice(idx + 1)) };
  });

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  HTTP_ADDR: HttpAddr.default({ host: "0.0.0.0", port: 8080 }),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

/** Parses env once at boot. Throws ConfigError so the process exits before binding a port. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const blankToUndefined = Object.fromEntries(
    Object.entries(env).map(([k, v]) => [k, v === "" ? undefined : v]),
  );
  const parsed = ConfigSchema.safeParse(blankToUndefined);
  if (!parsed.success) {
    throw new ConfigError(`Invalid configuration:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
