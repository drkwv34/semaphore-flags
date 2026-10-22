import { withClient, type Pool } from "./pool.js";

export async function pingPostgres(pool: Pool): Promise<boolean> {
  try {
    return await withClient(pool, async (client) => {
      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL statement_timeout = 500");
        await client.query("SELECT 1");
        await client.query("COMMIT");
        return true;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  } catch {
    return false;
  }
}
