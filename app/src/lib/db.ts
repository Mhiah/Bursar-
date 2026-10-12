import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

type Row = Record<string, any>;
interface Driver {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}

const g = globalThis as unknown as { __bursarDb?: Promise<Driver> };

async function open(): Promise<Driver> {
  const schema = fs.readFileSync(path.join(process.cwd(), "src", "lib", "schema.sql"), "utf8");

  if (process.env.DATABASE_URL) {
    const { Pool, types } = await import("pg");
    // Return BIGINT as string; callers convert with BigInt().
    types.setTypeParser(20, (v: string) => v);
    // Keep DATE as "YYYY-MM-DD" rather than a Date in the server's timezone.
    types.setTypeParser(1082, (v: string) => v);
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query(schema);
    return { query: async (sql, params) => (await pool.query(sql, params as any[])).rows };
  }

  // Local file database, for running on one machine without Postgres.
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.BURSAR_DATA_DIR || path.join(process.cwd(), ".data", "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const db = new PGlite(dir, { parsers: { 20: (v: string) => v, 1082: (v: string) => v } });
  await db.exec(schema);
  return {
    query: async <T extends Row>(sql: string, params?: unknown[]) => {
      const res = await db.query<T>(sql, params as any[]);
      return res.rows.map((r) => normalise(r as Row)) as T[];
    },
  };
}

// PGlite returns BIGINT as bigint; match pg, which returns strings.
function normalise(row: Row): Row {
  for (const k of Object.keys(row)) if (typeof row[k] === "bigint") row[k] = row[k].toString();
  return row;
}

function driver(): Promise<Driver> {
  if (!g.__bursarDb) g.__bursarDb = open();
  return g.__bursarDb;
}

export async function q<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await driver()).query<T>(sql, params);
}

export async function one<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(sql, params))[0];
}

export const newId = () => randomUUID();
