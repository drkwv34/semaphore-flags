#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { ConfigError, loadConfig } from "./config.js";
import { listKeysByProjectSlug, revokeKeyByProjectSlug } from "./services/api-keys.js";
import { createProjectWithKeys, seedDemoProject } from "./services/projects.js";
import { startServer } from "./server.js";
import { createPool, migrate } from "./store/index.js";

export type CliCommand =
  | { readonly name: "help" }
  | { readonly name: "migrate" }
  | { readonly name: "seed" }
  | { readonly name: "serve" }
  | { readonly name: "projects-create"; readonly nameFlag: string; readonly slug: string }
  | { readonly name: "keys-list"; readonly project: string }
  | { readonly name: "keys-revoke"; readonly project: string; readonly keyId: string }
  | { readonly name: "error"; readonly message: string };

const HELP = `semaphore — feature-flag service CLI

Usage:
  semaphore migrate
  semaphore seed
  semaphore projects create --name <name> --slug <slug>
  semaphore keys list --project <slug>
  semaphore keys revoke --project <slug> --key-id <uuid>
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
  if (cmd === "keys") {
    const sub = args[1];
    const rest = args.slice(2);
    if (sub === "list") {
      const project = flagValue(rest, "--project");
      if (project === undefined) {
        return { name: "error", message: "usage: semaphore keys list --project <slug>" };
      }
      return { name: "keys-list", project };
    }
    if (sub === "revoke") {
      const project = flagValue(rest, "--project");
      const keyId = flagValue(rest, "--key-id");
      if (project === undefined || keyId === undefined) {
        return {
          name: "error",
          message: "usage: semaphore keys revoke --project <slug> --key-id <uuid>",
        };
      }
      return { name: "keys-revoke", project, keyId };
    }
    return {
      name: "error",
      message:
        "usage: semaphore keys list --project <slug> | keys revoke --project <slug> --key-id <uuid>",
    };
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

function printKeyMetadata(key: {
  readonly id: string;
  readonly type: string;
  readonly prefix: string;
  readonly created_at: string;
  readonly revoked_at: string | null;
}): void {
  writeOut(
    `key: ${key.id} type=${key.type} prefix=${key.prefix} created_at=${key.created_at} revoked_at=${key.revoked_at ?? "-"}\n`,
  );
}

export async function writeSeedKeysFile(
  filePath: string,
  keys: { readonly adminKey: string; readonly evaluateKey: string },
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const payload =
    JSON.stringify({ admin_key: keys.adminKey, evaluate_key: keys.evaluateKey }, null, 2) + "\n";
  await writeFile(filePath, payload, { encoding: "utf8", mode: 0o600 });
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
        if (result.adminKey !== undefined) {
          writeOut(`admin key (shown once): ${result.adminKey.raw}\n`);
        }
        if (result.evaluateKey !== undefined) {
          writeOut(`evaluate key (shown once): ${result.evaluateKey.raw}\n`);
        }
        if (result.adminKey !== undefined && result.evaluateKey !== undefined) {
          const keysPath = process.env.SEED_KEYS_PATH?.trim();
          if (keysPath !== undefined && keysPath.length > 0) {
            try {
              await writeSeedKeysFile(keysPath, {
                adminKey: result.adminKey.raw,
                evaluateKey: result.evaluateKey.raw,
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              writeErr(`seed: failed to write SEED_KEYS_PATH (${message})\n`);
            }
          }
        }
        if (result.adminKey === undefined && result.evaluateKey === undefined) {
          writeOut("seed: demo project already exists; keys not re-printed\n");
        }
        return 0;
      }
      case "projects-create": {
        const created = await createProjectWithKeys(
          pool,
          {
            name: command.nameFlag,
            slug: command.slug,
          },
          { requestId: `cli:projects-create:${randomUUID()}` },
        );
        writeOut(`project: ${created.project.slug} (${created.project.id})\n`);
        printMintedKeys(created.adminKey.raw, created.evaluateKey.raw);
        return 0;
      }
      case "keys-list": {
        const listed = await listKeysByProjectSlug(pool, command.project);
        if (listed.items.length === 0) {
          writeOut(`keys: none for project ${command.project}\n`);
        } else {
          for (const key of listed.items) printKeyMetadata(key);
        }
        return 0;
      }
      case "keys-revoke": {
        const revoked = await revokeKeyByProjectSlug(
          pool,
          command.project,
          command.keyId,
          `cli:keys-revoke:${randomUUID()}`,
        );
        writeOut(
          `revoked: ${revoked.id} type=${revoked.type} prefix=${revoked.prefix} revoked_at=${revoked.revoked_at ?? "-"}\n`,
        );
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
