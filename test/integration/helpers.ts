import { randomBytes } from "node:crypto";

import { createPool, migrate, type Pool } from "../../src/store/index.js";

function requiredDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === "") {
    throw new Error("DATABASE_URL is required for integration tests");
  }
  return url;
}

export function testSchemaName(): string {
  return `test_${randomBytes(8).toString("hex")}`;
}

export async function withTestPool<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
  const url = requiredDatabaseUrl();
  const schema = testSchemaName();
  const admin = createPool(url);
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = createPool(url, schema);
    try {
      await migrate(pool);
      return await fn(pool);
    } finally {
      await pool.end();
    }
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
}

export async function withTestDatabase<T>(fn: (databaseUrl: string) => Promise<T>): Promise<T> {
  const url = requiredDatabaseUrl();
  const name = `db_${randomBytes(8).toString("hex")}`;
  const admin = createPool(url);
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    const dbUrl = new URL(url);
    dbUrl.pathname = `/${name}`;
    return await fn(dbUrl.toString());
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end();
  }
}
