import { buildApp } from "./api/app.js";
import type { Config } from "./config.js";
import { createPool, type Pool } from "./store/index.js";

export interface RunningServer {
  close(): Promise<void>;
}

export async function startServer(
  config: Config,
  pool: Pool = createPool(config.DATABASE_URL),
): Promise<RunningServer> {
  const app = buildApp(config, {
    pool,
    ...(config.REDIS_URL !== undefined ? { redisUrl: config.REDIS_URL } : {}),
    redisConfigured: config.REDIS_URL !== undefined,
  });

  const shutdown = async (): Promise<void> => {
    await app.close();
    await pool.end();
  };

  const onSignal = (signal: NodeJS.Signals): void => {
    app.log.info({ signal }, "shutting down");
    shutdown().then(
      () => process.exit(0),
      (err: unknown) => {
        app.log.error({ err }, "shutdown failed");
        process.exit(1);
      },
    );
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);

  await app.listen({ host: config.HTTP_ADDR.host, port: config.HTTP_ADDR.port });
  return { close: shutdown };
}
