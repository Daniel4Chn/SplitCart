// M7 A-DB-4: restore into a NEW isolated database; never overwrites live DB.
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { readFile, mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { Pool } from "pg";
import { pgEnv, command, projectPath } from "./backup";
const source = projectPath(process.argv[2] || "");
const manifest = JSON.parse(
  await readFile(join(source, "manifest.json"), "utf8"),
);
if (manifest.schemaVersion !== 1) throw Error("Unsupported backup");
const original = new URL(process.env.DATABASE_URL!);
const adminUrl = new URL(original);
adminUrl.pathname = "/postgres";
const admin = new Pool({ connectionString: adminUrl.toString() });
const name = "splitcart_restore_" + randomUUID().replaceAll("-", "");
const restored = new URL(original);
restored.pathname = "/" + name;
let db: Pool | undefined;
const storage = projectPath(".data/restore/" + name);
await mkdir(storage, { recursive: true, mode: 0o700 });
try {
  await admin.query('CREATE DATABASE "' + name + '"');
  await command(
    "pg_restore",
    [
      "--no-owner",
      "--no-acl",
      "--exit-on-error",
      "--dbname=" + name,
      join(source, "database.dump"),
    ],
    pgEnv(restored),
  );
  db = new Pool({ connectionString: restored.toString() });
  for (const [key, hash] of Object.entries(manifest.files)) {
    if (!/^[0-9a-f-]{36}\/(original|display\.png)$/.test(key))
      throw Error("Invalid backup key");
    const data = await readFile(join(source, "images", key));
    if (createHash("sha256").update(data).digest("hex") !== hash)
      throw Error("Image checksum mismatch");
    await mkdir(join(storage, key.split("/")[0]), {
      recursive: true,
      mode: 0o700,
    });
    await copyFile(join(source, "images", key), join(storage, key));
  }
  const finals = (await db.query("SELECT snapshot FROM finalizations")).rows;
  for (const { snapshot } of finals) {
    if (
      snapshot.shares.reduce(
        (sum: bigint, s: { finalCents: string }) => sum + BigInt(s.finalCents),
        0n,
      ) !== BigInt(snapshot.totalCents)
    )
      throw Error("Restored allocation mismatch");
  }
  const images = (
    await db.query("SELECT original_key,display_key FROM receipt_images")
  ).rows;
  for (const image of images)
    for (const key of [image.original_key, image.display_key])
      if (!manifest.files[key])
        throw Error("Referenced image missing from backup");
  console.log(
    JSON.stringify({
      database: name,
      receipts: (await db.query("SELECT count(*) FROM receipts")).rows[0].count,
      finalizations: finals.length,
      images: images.length,
      checks:
        "database restored; referenced images verified; exact shares reconcile",
      storage,
    }),
  );
} finally {
  await db?.end();
  await admin.end();
}
// Database and project-local restored evidence are deliberately retained for operator inspection.
