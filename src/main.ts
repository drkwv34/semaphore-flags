import { ConfigError, loadConfig } from "./config.js";
import { startServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  await startServer(config);
}

main().catch((err: unknown) => {
  const message = err instanceof ConfigError ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
