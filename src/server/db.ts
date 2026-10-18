import { Pool, type PoolClient } from "pg";
const globalDb = globalThis as unknown as { splitcartPool?: Pool };
export const pool =
  globalDb.splitcartPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") globalDb.splitcartPool = pool;
export async function transaction<T>(
  fn: (db: PoolClient) => Promise<T>,
): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const value = await fn(db);
    await db.query("COMMIT");
    return value;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
