import { randomBytes, randomUUID } from "node:crypto";

import { DEFAULT_ENV_KEYS } from "../domain/env-key.js";
import { parseEnvKey } from "../domain/env-key.js";
import { NotFoundError } from "../domain/errors.js";
import {
  DEMO_PROJECT_NAME,
  DEMO_PROJECT_SLUG,
  parseProjectName,
  parseProjectSlug,
} from "../domain/project.js";
import {
  ensureEnvironment,
  findProjectById,
  findProjectBySlug,
  insertEnvironment,
  insertProject,
  listApiKeysByProject,
  listEnvironments,
  withTx,
  type Pool,
  type Project,
} from "../store/index.js";
import { mintApiKey, persistMintedKey, type MintedApiKey } from "./api-keys.js";
import { seedDemoFlags } from "./flags.js";

export interface CreatedProject {
  readonly project: Project;
  readonly adminKey: MintedApiKey;
  readonly evaluateKey: MintedApiKey;
}

function randomSalt(): string {
  return randomBytes(32).toString("hex");
}

export async function createProjectWithKeys(
  pool: Pool,
  input: { name: string; slug: string },
  options: { requestId?: string } = {},
): Promise<CreatedProject> {
  const name = parseProjectName(input.name);
  const slug = parseProjectSlug(input.slug);
  const requestId = options.requestId ?? `cli:projects-create:${randomUUID()}`;
  const adminKey = mintApiKey("admin");
  const evaluateKey = mintApiKey("evaluate");

  const project = await withTx(pool, async (tx) => {
    const created = await insertProject(tx, { name, slug, salt: randomSalt() });
    for (const key of DEFAULT_ENV_KEYS) {
      await insertEnvironment(tx, { projectId: created.id, key });
    }
    await persistMintedKey(tx, created.id, adminKey, requestId);
    await persistMintedKey(tx, created.id, evaluateKey, requestId);
    return created;
  });

  return { project, adminKey, evaluateKey };
}

export interface SeedResult {
  readonly project: Project;
  readonly created: boolean;
  readonly adminKey?: MintedApiKey;
  readonly evaluateKey?: MintedApiKey;
}

async function seedFlagsWithAdmin(pool: Pool, projectId: string): Promise<void> {
  const keys = await listApiKeysByProject(pool, projectId);
  const admin = keys.find((k) => k.type === "admin" && k.revokedAt === null);
  if (admin === undefined) return;
  await seedDemoFlags(pool, {
    projectId,
    actorKeyId: admin.id,
    requestId: "seed",
  });
}

export async function seedDemoProject(pool: Pool): Promise<SeedResult> {
  const requestId = `cli:seed:${randomUUID()}`;
  const existing = await findProjectBySlug(pool, DEMO_PROJECT_SLUG);
  if (existing) {
    await withTx(pool, async (tx) => {
      for (const key of DEFAULT_ENV_KEYS) {
        await ensureEnvironment(tx, { projectId: existing.id, key });
      }
    });
    const keys = await listApiKeysByProject(pool, existing.id);
    const hasAdmin = keys.some((k) => k.type === "admin" && k.revokedAt === null);
    const hasEvaluate = keys.some((k) => k.type === "evaluate" && k.revokedAt === null);
    if (hasAdmin && hasEvaluate) {
      await seedFlagsWithAdmin(pool, existing.id);
      return { project: existing, created: false };
    }

    let adminKey: MintedApiKey | undefined;
    let evaluateKey: MintedApiKey | undefined;
    await withTx(pool, async (tx) => {
      if (!hasAdmin) {
        adminKey = mintApiKey("admin");
        await persistMintedKey(tx, existing.id, adminKey, requestId);
      }
      if (!hasEvaluate) {
        evaluateKey = mintApiKey("evaluate");
        await persistMintedKey(tx, existing.id, evaluateKey, requestId);
      }
    });
    await seedFlagsWithAdmin(pool, existing.id);
    return {
      project: existing,
      created: false,
      ...(adminKey !== undefined ? { adminKey } : {}),
      ...(evaluateKey !== undefined ? { evaluateKey } : {}),
    };
  }

  const created = await createProjectWithKeys(
    pool,
    {
      name: DEMO_PROJECT_NAME,
      slug: DEMO_PROJECT_SLUG,
    },
    { requestId },
  );
  await seedFlagsWithAdmin(pool, created.project.id);
  return {
    project: created.project,
    created: true,
    adminKey: created.adminKey,
    evaluateKey: created.evaluateKey,
  };
}

export async function getCurrentProject(pool: Pool, projectId: string): Promise<Project> {
  const project = await findProjectById(pool, projectId);
  if (!project) throw new NotFoundError("project", projectId);
  return project;
}

export async function createProjectEnvironment(
  pool: Pool,
  projectId: string,
  rawKey: string,
): Promise<{ id: string; key: string; createdAt: Date }> {
  const key = parseEnvKey(rawKey);
  return insertEnvironment(pool, { projectId, key });
}

export async function projectEnvironments(pool: Pool, projectId: string) {
  return listEnvironments(pool, projectId);
}
