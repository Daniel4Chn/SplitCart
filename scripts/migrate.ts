import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { pool } = await import("../src/server/db");
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const db = await pool.connect();
try {
  await db.query("SELECT pg_advisory_lock(713204)");
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const name of (await readdir("db/migrations"))
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    const sql = await readFile("db/migrations/" + name, "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    const previous = await db.query(
      "SELECT checksum FROM schema_migrations WHERE name=$1",
      [name],
    );
    if (previous.rowCount) {
      if (previous.rows[0].checksum !== hash)
        throw Error("Changed applied migration: " + name);
      continue;
    }
    await db.query("BEGIN");
    try {
      await db.query(sql);
      await db.query(
        "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
        [name, hash],
      );
      await db.query("COMMIT");
      console.log("Applied", name);
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    }
  }
} finally {
  await db.query("SELECT pg_advisory_unlock(713204)");
  db.release();
  await pool.end();
}
