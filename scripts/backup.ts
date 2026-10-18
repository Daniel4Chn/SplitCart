// M7 DB-07 A-DB-4: consistent DB + referenced private image backup. Operator-only.
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { mkdir, copyFile, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { Pool } from "pg";
export function pgEnv(url: URL) {
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  };
}
export function command(
  binary: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) {
  return new Promise<void>((yes, no) => {
    const p = spawn(binary, args, {
      env,
      shell: false,
      stdio: ["ignore", "ignore", "ignore"],
    });
    p.on("error", () => no(Error(binary + " unavailable")));
    p.on("close", (code) =>
      code === 0
        ? yes()
        : no(Error(binary + " failed; inspect operator configuration")),
    );
  });
}
export function projectPath(value: string) {
  const p = resolve(value);
  if (!p.startsWith(resolve(".") + "/"))
    throw Error("Path must be within project directory");
  return p;
}
export async function backup() {
  const url = new URL(process.env.DATABASE_URL!);
  const db = new Pool({ connectionString: url.toString() });
  const client = await db.connect();
  const dest = projectPath(".data/backups/" + randomUUID());
  await mkdir(dest, { recursive: true, mode: 0o700 });
  try {
    await client.query("BEGIN");
    const tables = (
      await client.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
    ).rows.map(
      (x) => '"public"."' + String(x.tablename).replaceAll('"', '""') + '"',
    );
    if (tables.length)
      await client.query("LOCK TABLE " + tables.join(",") + " IN SHARE MODE");
    await command(
      "pg_dump",
      [
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--file=" + join(dest, "database.dump"),
      ],
      pgEnv(url),
    );
    const images = (
      await client.query("SELECT original_key,display_key FROM receipt_images")
    ).rows;
    const files: Record<string, string> = {};
    const storage = projectPath(
      process.env.SPLITCART_STORAGE_DIR || ".data/images",
    );
    for (const image of images)
      for (const key of [image.original_key, image.display_key]) {
        if (!/^[0-9a-f-]{36}\/(original|display\.png)$/.test(key))
          throw Error("Invalid storage key");
        await mkdir(join(dest, "images", key.split("/")[0]), {
          recursive: true,
          mode: 0o700,
        });
        await copyFile(join(storage, key), join(dest, "images", key));
        files[key] = createHash("sha256")
          .update(await readFile(join(dest, "images", key)))
          .digest("hex");
      }
    await writeFile(
      join(dest, "manifest.json"),
      JSON.stringify(
        { schemaVersion: 1, createdAt: new Date().toISOString(), files },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    await client.query("COMMIT");
    console.log("Backup created:", dest);
    return dest;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await db.end();
  }
}
if (process.argv[1]?.endsWith("/backup.ts")) await backup();
