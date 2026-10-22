import dns from "node:dns";

import pg from "pg";

// Node 17+ prefers AAAA. Compose service names often have a broken IPv6 path that
// exceeds a short connectionTimeout. Prefer IPv4 inside Docker networks.
dns.setDefaultResultOrder("ipv4first");

const { Pool } = pg;

export type Pool = InstanceType<typeof Pool>;
export type PoolClient = pg.PoolClient;
export type Queryable = Pick<Pool, "query">;

export function createPool(databaseUrl: string, searchPath?: string): Pool {
  return new Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    ...(searchPath !== undefined ? { options: `-c search_path=${searchPath}` } : {}),
  });
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
