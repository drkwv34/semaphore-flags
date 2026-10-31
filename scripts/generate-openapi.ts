#!/usr/bin/env node
/**
 * Write contracts/openapi/openapi.json from the live Fastify route schemas.
 *
 *   pnpm openapi:generate
 *
 * CI regenerates and fails on diff. Edit route schemas, then re-run this
 * intentionally — do not hand-edit the committed document.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildDocumentedApp } from "../src/api/app.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(repoRoot, "contracts/openapi/openapi.json");

const app = await buildDocumentedApp();
await app.ready();
const document = app.swagger();
await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
await app.close();
process.stdout.write(`wrote ${path.relative(repoRoot, outPath)}\n`);
