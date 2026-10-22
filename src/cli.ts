#!/usr/bin/env node

import { ConfigError, loadConfig } from "./config.js";
import { createProjectWithKeys, seedDemoProject } from "./services/projects.js";
import { startServer } from "./server.js";
import { createPool, migrate } from "./store/index.js";

export type CliCommand =
  | { readonly name: "help" }
  | { readonly name: "migrate" }
  | { readonly name: "seed" }
  | { readonly name: "serve" }
  | { readonly name: "projects-create"; readonly nameFlag: string; readonly slug: string }
  | { readonly name: "error"; readonly message: string };

const HELP = `semaphore — feature-flag service CLI

Usage:
  semaphore migrate
  semaphore seed
  semaphore projects create --name <name> --slug <slug>
  semaphore serve
  semaphore --help
`;

function flagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

export function parseCli(argv: string[]): CliCommand {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h" || args[0] === "help") {
    return { name: "help" };
  }
  const cmd = args[0] ?? "";
  if (cmd === "migrate") return { name: "migrate" };
  if (cmd === "seed") return { name: "seed" };
  if (cmd === "serve") return { name: "serve" };
  if (cmd === "projects") {
    if (args[1] !== "create") {
      return {
        name: "error",
        message: "usage: semaphore projects create --name <name> --slug <slug>",
      };
    }
    const rest = args.slice(2);
    const nameFlag = flagValue(rest, "--name");
    const slug = flagValue(rest, "--slug");
    if (nameFlag === undefined || slug === undefined) {
      return {
        name: "error",
        message: "usage: semaphore projects create --name <name> --slug <slug>",
      };
    }
    return { name: "projects-create", nameFlag, slug };
  }
  return { name: "error", message: `unknown command: ${cmd}\n${HELP}` };
}

function writeOut(text: string): void {
  process.stdout.write(text);
}

function writeErr(text: string): void {
  process.stderr.write(text);
}

function printMintedKeys(adminRaw: string, evaluateRaw: string): void {
  writeOut(`admin key (shown once): ${adminRaw}\n`);
  writeOut(`evaluate key (shown once): ${evaluateRaw}\n`);
}

export async function runCli(argv: string[] = process.argv): Promise<number> {
  const command = parseCli(argv);
  if (command.name === "help") {
    writeOut(HELP);
    return 0;
  }
  if (command.name === "error") {
    writeErr(`${command.message}\n`);
    return 1;
  }

  const config = loadConfig();
  const pool = createPool(config.DATABASE_URL);
  let serving = false;
  try {
    switch (command.name) {
      case "migrate": {
        const result = await migrate(pool);
        writeOut(
          result.applied.length === 0
            ? "migrate: already up to date\n"
            : `migrate: applied ${result.applied.join(", ")}\n`,
        );
        return 0;
      }
      case "seed": {
        const result = await seedDemoProject(pool);
        writeOut(`seed: project ${result.project.slug} (${result.project.id})\n`);
        if (result.adminKey !== undefined && result.evaluateKey !== undefined) {
          printMintedKeys(result.adminKey.raw, result.evaluateKey.raw);
        } else {
          writeOut("seed: demo project already exists; keys not re-printed\n");
        }
        return 0;
      }
      case "projects-create": {
        const created = await createProjectWithKeys(pool, {
          name: command.nameFlag,
          slug: command.slug,
        });
        writeOut(`project: ${created.project.slug} (${created.project.id})\n`);
        printMintedKeys(created.adminKey.raw, created.evaluateKey.raw);
        return 0;
      }
      case "serve": {
        await startServer(config, pool);
        serving = true;
        return 0;
      }
      default: {
        const unexpected: never = command;
        throw new Error(`unhandled command: ${String(unexpected)}`);
      }
    }
  } finally {
    if (!serving) {
      await pool.end();
    }
  }
}

function isMain(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && (entry.endsWith("/cli.js") || entry.endsWith("/cli.ts"));
}

if (isMain()) {
  runCli().then(
    (code) => {
      if (code !== 0) process.exit(code);
    },
    (err: unknown) => {
      const message =
        err instanceof ConfigError || err instanceof Error ? err.message : String(err);
      writeErr(`${message}\n`);
      process.exit(1);
    },
  );
}
