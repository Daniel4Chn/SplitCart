// M0/M2 A-FOUND-1 A-DB-1: clean install, ledger no-op, restart persistence.
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { command } from "./backup";
const current = new URL(process.env.DATABASE_URL!);
const adminURL = new URL(current);
adminURL.pathname = "/postgres";
const admin = new Pool({ connectionString: adminURL.toString() });
const name = "splitcart_setup_" + randomUUID().replaceAll("-", "");
const target = new URL(current);
target.pathname = "/" + name;
let db: Pool | undefined;
try {
  await admin.query('CREATE DATABASE "' + name + '"');
  for (let i = 0; i < 2; i++)
    await command(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "scripts/migrate.ts"],
      { ...process.env, DATABASE_URL: target.toString() },
    );
  db = new Pool({ connectionString: target.toString() });
  const count = Number(
    (await db.query("SELECT count(*) FROM schema_migrations")).rows[0].count,
  );
  if (count !== 4) throw Error("Incomplete migration ledger");
  await db.end();
  db = undefined;
  const next = new Pool({ connectionString: target.toString() });
  console.log(
    "Clean database migration and no-op replay passed; reconnect ledger:",
    (await next.query("SELECT count(*) FROM schema_migrations")).rows[0].count,
  );
  await next.end();
} finally {
  await db?.end();
  await admin.query('DROP DATABASE IF EXISTS "' + name + '"');
  await admin.end();
}
