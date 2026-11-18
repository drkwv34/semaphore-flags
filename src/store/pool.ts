import dns from "node:dns";

import pg from "pg";

// Node 17+ prefers AAAA. Compose service names often have a broken IPv6 path that
// exceeds a short connectionTimeout. Prefer IPv4 inside Docker networks.
dns.setDefaultResultOrder("ipv4first");

const { Pool } = pg;

export type Pool = InstanceType<typeof Pool>;
export type PoolClient = pg.PoolClient;
export type Queryable = Pick<Pool, "query">;

const POOL_ERROR_WARN_INTERVAL_MS = 10_000;

export type PoolErrorLog = {
  warn: (obj: Record<string, unknown>, msg: string) => void;
};

function publicPoolErrorFields(err: unknown): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    err_name: err instanceof Error ? err.name : "Error",
  };
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = err.code;
    if (typeof code === "string" || typeof code === "number") {
      fields.err_code = String(code);
    }
  }
  return fields;
}

function defaultPoolLog(): PoolErrorLog {
  return {
    warn(obj, msg) {
      process.stdout.write(`${JSON.stringify({ level: "warn", msg, ...obj })}\n`);
    },
  };
}

export function createPool(
  databaseUrl: string,
  searchPath?: string,
  log: PoolErrorLog = defaultPoolLog(),
): Pool {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    ...(searchPath !== undefined ? { options: `-c search_path=${searchPath}` } : {}),
  });
  let lastWarnAt = 0;
  pool.on("error", (err: Error) => {
    const now = Date.now();
    if (now - lastWarnAt < POOL_ERROR_WARN_INTERVAL_MS) return;
    lastWarnAt = now;
    log.warn(publicPoolErrorFields(err), "postgres pool idle client error");
  });
  return pool;
}

export async function withClient<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function withTx<T>(pool: Pool, fn: (tx: PoolClient) => Promise<T>): Promise<T> {
  return withClient(pool, async (client) => {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

/** API sessions: 2s statement_timeout. Migrations must not use this. */
export async function configureApiSession(client: PoolClient): Promise<void> {
  await client.query("SET statement_timeout = 2000");
}
