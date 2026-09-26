import { buildApp } from "./api/app.js";
import { ConfigError, loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const app = buildApp(config);

  const shutdown = (signal: NodeJS.Signals): void => {
    app.log.info({ signal }, "shutting down");
    app.close().then(
      () => process.exit(0),
      (err: unknown) => {
        app.log.error({ err }, "shutdown failed");
        process.exit(1);
      },
    );
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

  await app.listen({ host: config.HTTP_ADDR.host, port: config.HTTP_ADDR.port });
}

main().catch((err: unknown) => {
  const message = err instanceof ConfigError ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
