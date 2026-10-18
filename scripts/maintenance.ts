import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { recover, cleanupDeletion } = await import("../src/server/images");
const { pool } = await import("../src/server/db");
try {
  await recover();
  const pending = await pool.query(
    "SELECT id,owner_user_id FROM storage_deletions WHERE state<>'complete' ORDER BY created_at LIMIT 100",
  );
  for (const row of pending.rows)
    await cleanupDeletion(row.owner_user_id, row.id);
  console.log("Recovery and deletion retry sweep finished.");
} finally {
  await pool.end();
}
