import { randomUUID, createHash } from "node:crypto";
import {
  mkdir,
  writeFile,
  readFile,
  rename,
  rm,
  readdir,
  stat,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { pool, transaction } from "./db";
import { ownedRow, checkVersion, getReceipt } from "./receipts";
import { worker } from "./worker";
import { ocrSchema, validatedSchema } from "@/domain/ocr-contract";
import { AppError } from "@/domain/errors";
const root = () => resolve(process.env.SPLITCART_STORAGE_DIR || ".data/images");
function file(key: string) {
  if (!/^[0-9a-f-]{36}\/(original|display\.png)$/.test(key))
    throw new AppError("INTERNAL_ERROR", 500);
  return join(root(), key);
}
async function scratch() {
  await mkdir(join(root(), "scratch"), { recursive: true, mode: 0o700 });
  const id = randomUUID(),
    dir = join(root(), "scratch", id);
  await mkdir(dir, { mode: 0o700 });
  return { id, dir };
}
export async function boundedMultipart(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 10 * 1024 * 1024 + 65536)
    throw new AppError("UPLOAD_TOO_LARGE", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("MALFORMED_REQUEST", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 10 * 1024 * 1024 + 65536) {
      await reader.cancel();
      throw new AppError("UPLOAD_TOO_LARGE", 413);
    }
    chunks.push(value);
  }
  try {
    return await new Response(Buffer.concat(chunks), {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    throw new AppError("MALFORMED_REQUEST", 400);
  }
}
export async function upload(
  owner: string,
  id: string,
  version: number,
  blob: File,
  signal?: AbortSignal,
) {
  const row = await ownedRow(owner, id);
  checkVersion(row, version);
  if (blob.size > 10 * 1024 * 1024) throw new AppError("UPLOAD_TOO_LARGE", 413);
  if (!blob.size) throw new AppError("IMAGE_UNREADABLE", 422);
  if (!["image/png", "image/jpeg"].includes(blob.type))
    throw new AppError("UNSUPPORTED_IMAGE", 415);
  const bytes = Buffer.from(await blob.arrayBuffer());
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (
    (blob.type === "image/png" && !png) ||
    (blob.type === "image/jpeg" && !jpeg)
  )
    throw new AppError("UNSUPPORTED_IMAGE", 415);
  const hash = createHash("sha256").update(bytes).digest("hex");
  async function duplicate() {
    const d = (
      await pool.query(
        "SELECT receipt_id FROM receipt_images WHERE owner_user_id=$1 AND sha256=$2",
        [owner, hash],
      )
    ).rows[0];
    if (d)
      throw new AppError(
        "DUPLICATE_IMAGE",
        409,
        "This image is already saved. Reopen receipt " + d.receipt_id + ".",
      );
  }
  await duplicate();
  const { id: attempt, dir } = await scratch();
  const imageId = randomUUID(),
    dest = join(root(), imageId);
  let moved = false;
  const capacity = await pool.connect();
  try {
    if (
      !(await capacity.query("SELECT pg_try_advisory_lock(713205) AS acquired"))
        .rows[0].acquired
    )
      throw new AppError("OCR_BUSY", 429);
    await writeFile(join(dir, "original"), bytes, { mode: 0o600 });
    await writeFile(
      join(dir, "request.json"),
      JSON.stringify({
        schemaVersion: 1,
        attemptId: attempt,
        language: "eng",
        mode: "validate",
        mime: blob.type,
      }),
      { mode: 0o600 },
    );
    const checked = validatedSchema.safeParse(
      await worker(
        join(dir, "original"),
        join(dir, "request.json"),
        signal,
        attempt,
      ),
    );
    if (!checked.success) throw new AppError("OCR_FAILED", 502);
    const result = checked.data;
    if (result.attemptId !== attempt) throw new AppError("OCR_FAILED", 502);
    await transaction(async (db) => {
      const current = await ownedRow(owner, id, db, true);
      checkVersion(current, version);
      if (
        (
          await db.query("SELECT 1 FROM receipt_images WHERE receipt_id=$1", [
            id,
          ])
        ).rowCount
      )
        throw new AppError("IMAGE_EXISTS", 409);
      await mkdir(dest, { mode: 0o700 });
      moved = true;
      await rename(join(dir, "original"), join(dest, "original"));
      await rename(join(dir, "display.png"), join(dest, "display.png"));
      await db.query(
        "INSERT INTO receipt_images(id,receipt_id,owner_user_id,sha256,original_key,display_key,mime,byte_count,width,height) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          imageId,
          id,
          owner,
          hash,
          imageId + "/original",
          imageId + "/display.png",
          blob.type,
          bytes.length,
          result.image.width,
          result.image.height,
        ],
      );
      await db.query(
        "UPDATE receipts SET version=version+1,updated_at=now(),review=jsonb_set(review,'{confirmed}','false') WHERE id=$1",
        [id],
      );
    });
    moved = false;
    return getReceipt(owner, id);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") await duplicate();
    throw e;
  } finally {
    await capacity.query("SELECT pg_advisory_unlock(713205)");
    capacity.release();
    await rm(dir, { recursive: true, force: true });
    if (moved) await rm(dest, { recursive: true, force: true });
  }
}
export async function imageResponse(
  owner: string,
  id: string,
  variant: string,
) {
  await ownedRow(owner, id);
  const image = (
    await pool.query(
      "SELECT * FROM receipt_images WHERE receipt_id=$1 AND owner_user_id=$2",
      [id, owner],
    )
  ).rows[0];
  if (!image) throw new AppError("NOT_FOUND", 404);
  try {
    const bytes = await readFile(
      file(variant === "original" ? image.original_key : image.display_key),
    );
    return new Response(bytes, {
      headers: {
        "Content-Type": variant === "original" ? image.mime : "image/png",
        "Content-Disposition":
          variant === "original" ? 'attachment; filename="receipt"' : "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    throw new AppError(
      "IMAGE_UNAVAILABLE",
      503,
      "Saved image is unavailable. Your draft is preserved.",
    );
  }
}
export async function recover() {
  await pool.query(
    "UPDATE processing_attempts SET state='failed',error_code='OCR_INTERRUPTED',ended_at=now() WHERE state='processing' AND deadline<now()",
  );
  await mkdir(join(root(), "scratch"), { recursive: true, mode: 0o700 });
  for (const name of await readdir(join(root(), "scratch"))) {
    if (!/^[0-9a-f-]{36}$/.test(name)) continue;
    const dir = join(root(), "scratch", name);
    if (Date.now() - (await stat(dir)).mtimeMs > 120000)
      await rm(dir, { recursive: true, force: true });
  }
  // Reclaim staged files left by a process dying between filesystem move and DB commit.
  for (const name of await readdir(root())) {
    if (!/^[0-9a-f-]{36}$/.test(name)) continue;
    const dir = join(root(), name);
    if (Date.now() - (await stat(dir)).mtimeMs < 120000) continue;
    if (
      !(await pool.query("SELECT 1 FROM receipt_images WHERE id=$1", [name]))
        .rowCount
    )
      await rm(dir, { recursive: true, force: true });
  }
}
export async function processReceipt(
  owner: string,
  id: string,
  version: number,
  signal?: AbortSignal,
) {
  await recover();
  const db = await pool.connect();
  let attempt: string | undefined, dir: string | undefined;
  try {
    if (
      !(await db.query("SELECT pg_try_advisory_lock(713205) AS acquired"))
        .rows[0].acquired
    )
      throw new AppError("OCR_BUSY", 429, "Processing is busy. Retry shortly.");
    const row = await ownedRow(owner, id);
    checkVersion(row, version);
    if (
      (
        await db.query(
          "SELECT 1 FROM processing_attempts WHERE receipt_id=$1 AND state='processing'",
          [id],
        )
      ).rowCount
    )
      throw new AppError("PROCESSING_ACTIVE", 409);
    const image = (
      await db.query(
        "SELECT * FROM receipt_images WHERE receipt_id=$1 AND owner_user_id=$2",
        [id, owner],
      )
    ).rows[0];
    if (!image) throw new AppError("IMAGE_REQUIRED", 422);
    const work = await scratch();
    attempt = work.id;
    dir = work.dir;
    await db.query(
      "INSERT INTO processing_attempts(id,receipt_id,input_version,state,deadline) VALUES($1,$2,$3,'processing',now()+interval '75 seconds')",
      [attempt, id, version],
    );
    await writeFile(
      join(dir, "original"),
      await readFile(file(image.original_key)),
      { mode: 0o600 },
    );
    await writeFile(
      join(dir, "request.json"),
      JSON.stringify({
        schemaVersion: 1,
        attemptId: attempt,
        language: "eng",
        mode: "ocr",
        mime: image.mime,
      }),
      { mode: 0o600 },
    );
    let result;
    try {
      result = ocrSchema.parse(
        await worker(
          join(dir, "original"),
          join(dir, "request.json"),
          signal,
          attempt,
        ),
      );
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError("OCR_FAILED", 502);
    }
    if (result.attemptId !== attempt) throw new AppError("OCR_FAILED", 502);
    await db.query(
      "UPDATE processing_attempts SET state='succeeded',result=$1,ended_at=now() WHERE id=$2 AND state='processing'",
      [JSON.stringify(result), attempt],
    );
    return getReceipt(owner, id);
  } catch (e) {
    if (attempt)
      await db.query(
        "UPDATE processing_attempts SET state='failed',error_code=$1,ended_at=now() WHERE id=$2",
        [e instanceof AppError ? e.code : "OCR_FAILED", attempt],
      );
    throw e;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
    await db.query("SELECT pg_advisory_unlock(713205)");
    db.release();
  }
}
export async function cleanupDeletion(owner: string, id: string) {
  const row = (
    await pool.query(
      "SELECT * FROM storage_deletions WHERE id=$1 AND owner_user_id=$2",
      [id, owner],
    )
  ).rows[0];
  if (!row) throw new AppError("NOT_FOUND", 404);
  if (row.state !== "complete")
    try {
      for (const key of row.keys as string[])
        await rm(file(key), { force: true });
      await pool.query(
        "UPDATE storage_deletions SET state='complete',keys='[]',updated_at=now() WHERE id=$1",
        [id],
      );
      row.state = "complete";
    } catch {
      await pool.query(
        "UPDATE storage_deletions SET state='failed',retry_count=retry_count+1,updated_at=now() WHERE id=$1",
        [id],
      );
      row.state = "failed";
    }
  return { id, state: row.state };
}
export async function deleteReceipt(
  owner: string,
  id: string,
  version: number,
) {
  const deletionId = randomUUID();
  await transaction(async (db) => {
    const row = await ownedRow(owner, id, db, true);
    if (row.version !== version) throw new AppError("VERSION_CONFLICT", 409);
    if (
      (
        await db.query(
          "SELECT 1 FROM processing_attempts WHERE receipt_id=$1 AND state='processing' AND deadline>now()",
          [id],
        )
      ).rowCount
    )
      throw new AppError("PROCESSING_ACTIVE", 409);
    const image = (
      await db.query(
        "SELECT original_key,display_key FROM receipt_images WHERE receipt_id=$1",
        [id],
      )
    ).rows[0];
    await db.query(
      "INSERT INTO storage_deletions(id,owner_user_id,state,keys) VALUES($1,$2,'pending',$3)",
      [
        deletionId,
        owner,
        JSON.stringify(image ? [image.original_key, image.display_key] : []),
      ],
    );
    await db.query("DELETE FROM receipts WHERE id=$1", [id]);
  });
  const status = await cleanupDeletion(owner, deletionId);
  return {
    deletionId,
    state: status.state,
    statusUrl: "/api/v1/deletions/" + deletionId,
  };
}
