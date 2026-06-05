import pg from "pg";
import { loadConfig } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: loadConfig().databaseUrl
});

export async function query<T>(text: string, values: unknown[] = []): Promise<T[]> {
  const result = await pool.query(text, values);
  return result.rows as T[];
}

export async function queryOne<T>(text: string, values: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, values);
  return rows[0] ?? null;
}

export async function closePool(): Promise<void> {
  await pool.end();
}
