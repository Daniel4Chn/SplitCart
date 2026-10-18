import nextEnv from "@next/env";
const priorEnv = process.env.NODE_ENV;
Object.assign(process.env, { NODE_ENV: "development" });
nextEnv.loadEnvConfig(process.cwd(), true);
Object.assign(process.env, { NODE_ENV: priorEnv });
import { afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { Draft } from "../../src/domain/contracts";
const { pool, transaction } = await import("../../src/server/db");
const r = await import("../../src/server/receipts");
const owners: string[] = [];
afterAll(async () => {
  for (const owner of owners) {
    await pool.query(
      "DELETE FROM receipts WHERE household_id IN (SELECT id FROM households WHERE owner_user_id=$1)",
      [owner],
    );
    await pool.query(
      "DELETE FROM participants WHERE household_id IN (SELECT id FROM households WHERE owner_user_id=$1)",
      [owner],
    );
    await pool.query("DELETE FROM households WHERE owner_user_id=$1", [owner]);
    await pool.query("DELETE FROM storage_deletions WHERE owner_user_id=$1", [
      owner,
    ]);
    await pool.query("DELETE FROM users WHERE id=$1", [owner]);
  }
  await pool.end();
});
async function setup() {
  const owner = await r.ensureOwner("test", randomUUID());
  owners.push(owner);
  return { owner, h: await r.household(owner) };
}
function graph(version: number, payer: string): Draft {
  const item = randomUUID();
  return {
    schemaVersion: 1,
    expectedVersion: version,
    merchant: "Synthetic grocery",
    purchasedOn: "2026-10-17",
    payerParticipantId: payer,
    reviewedTotalCents: "891",
    items: [
      {
        id: item,
        description: "Groceries",
        quantity: "2",
        unitPriceCents: null,
        grossCents: "1000",
        sourceLineIds: [],
      },
    ],
    assignments: [{ itemId: item, participantId: payer, weight: 1 }],
    adjustments: [
      ["line_discount", "100"],
      ["receipt_discount", "90"],
      ["tax", "81"],
    ].map(([kind, amountCents], i) => ({
      id: randomUUID(),
      kind: kind as "tax",
      amountCents,
      label: kind,
      sequence: i + 1,
      targetItemIds: [item],
      eligibilityConfirmed: true,
    })),
    review: { confirmed: true, sourceAttemptId: null, lineResolutions: [] },
  };
}
describe("M2 A-SPL-3 A-DB-1,2 A-API-1,3 real PostgreSQL", () => {
  it("persists exact graph; rejects stale writes; concurrent finalization is one immutable snapshot", async () => {
    const { owner, h } = await setup();
    const receipt = await r.createReceipt(owner);
    const d = graph(receipt.version, h.participants[0].id);
    const saved = await r.saveDraft(owner, receipt.id, d);
    expect(saved.draft.items[0].quantity).toBe("2.000");
    await expect(r.saveDraft(owner, receipt.id, d)).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    });
    expect((await r.preview(owner, receipt.id, saved.version)).totalCents).toBe(
      "891",
    );
    const finals = await Promise.all([
      r.finalize(owner, receipt.id, saved.version),
      r.finalize(owner, receipt.id, saved.version),
    ]);
    expect(finals.map((x) => x.created).sort()).toEqual([false, true]);
    expect(finals[0].receipt.finalization!.id).toBe(
      finals[1].receipt.finalization!.id,
    );
    await expect(
      r.saveDraft(owner, receipt.id, {
        ...d,
        expectedVersion: saved.version + 1,
      }),
    ).rejects.toMatchObject({ code: "FINALIZED" });
    await expect(
      pool.query("UPDATE items SET description=$1 WHERE receipt_id=$2", [
        "tamper",
        receipt.id,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    expect(
      (await r.getReceipt(owner, receipt.id)).finalization!.totalCents,
    ).toBe("891");
  });
  it("rejects cross-owner graph and DB relationships and preserves graph on rollback", async () => {
    const a = await setup(),
      b = await setup();
    const receipt = await r.createReceipt(a.owner);
    const d = graph(1, a.h.participants[0].id);
    await r.saveDraft(a.owner, receipt.id, d);
    await expect(r.getReceipt(b.owner, receipt.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      r.saveDraft(a.owner, receipt.id, {
        ...d,
        expectedVersion: 2,
        payerParticipantId: b.h.participants[0].id,
      }),
    ).rejects.toMatchObject({ code: "INVALID_PARTICIPANT" });
    await expect(
      pool.query("UPDATE receipts SET payer_participant_id=$1 WHERE id=$2", [
        b.h.participants[0].id,
        receipt.id,
      ]),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      transaction(async (db) => {
        await db.query("DELETE FROM adjustments WHERE receipt_id=$1", [
          receipt.id,
        ]);
        throw Error("injected interruption");
      }),
    ).rejects.toThrow("injected");
    expect(
      (await r.getReceipt(a.owner, receipt.id)).draft.adjustments,
    ).toHaveLength(3);
    const mismatch = { ...d, expectedVersion: 2, reviewedTotalCents: "892" };
    await r.saveDraft(a.owner, receipt.id, mismatch);
    await expect(r.finalize(a.owner, receipt.id, 3)).rejects.toMatchObject({
      code: "UNRECONCILED",
    });
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM finalizations WHERE receipt_id=$1",
          [receipt.id],
        )
      ).rows[0].count,
    ).toBe("0");
  });
});
describe("M3/M5/M6 A-IMG-1..4 A-API-2 A-DB-3 native image lifecycle", () => {
  it("validates bytes, isolates duplicate hashes, preserves edits during OCR and deletes private evidence", async () => {
    const { readFile } = await import("node:fs/promises");
    const images = await import("../../src/server/images");
    const { ocrSchema } = await import("../../src/domain/ocr-contract");
    const a = await setup(),
      b = await setup();
    const receipt = await r.createReceipt(a.owner);
    const bytes = await readFile("tests/fixtures/synthetic-receipt.png");
    await expect(
      images.upload(
        a.owner,
        receipt.id,
        1,
        new File([Buffer.from("not an image")], "../../x.png", {
          type: "image/png",
        }),
      ),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_IMAGE" });
    const saved = await images.upload(
      a.owner,
      receipt.id,
      1,
      new File([bytes], "../../escape.png", { type: "image/png" }),
    );
    expect(saved.version).toBe(2);
    expect(saved.image).not.toBeNull();
    await expect(
      images.imageResponse(b.owner, receipt.id, "display"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const response = await images.imageResponse(
      a.owner,
      receipt.id,
      "original",
    );
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    const duplicate = await r.createReceipt(a.owner);
    await expect(
      images.upload(
        a.owner,
        duplicate.id,
        1,
        new File([bytes], "copy.png", { type: "image/png" }),
      ),
    ).rejects.toMatchObject({ code: "DUPLICATE_IMAGE" });
    const other = await r.createReceipt(b.owner);
    await images.upload(
      b.owner,
      other.id,
      1,
      new File([bytes], "same.png", { type: "image/png" }),
    );
    const started = images.processReceipt(a.owner, receipt.id, 2);
    await new Promise((res) => setTimeout(res, 100));
    const d = graph(2, a.h.participants[0].id);
    const changed = await r.saveDraft(a.owner, receipt.id, d);
    expect(changed.version).toBe(3);
    const processed = await started;
    expect(processed.version).toBe(3);
    expect(processed.draft.merchant).toBe("Synthetic grocery");
    expect(processed.processing?.state).toBe("succeeded");
    const result = ocrSchema.parse(processed.processing?.result);
    expect(result.tokens.length).toBeGreaterThan(0);
    expect(result.engine.languageDataVersion).toMatch(/^[0-9a-f]{64}$/);
    expect(result.candidate.totalCents).toBe("600");
    const badReview = {
      ...processed.draft,
      review: {
        confirmed: true,
        sourceAttemptId: processed.processing!.id,
        lineResolutions: [],
      },
    };
    await expect(
      r.saveDraft(a.owner, receipt.id, badReview),
    ).rejects.toMatchObject({ code: "REVIEW_REQUIRED" });
    const status = await images.deleteReceipt(a.owner, receipt.id, 3);
    expect(status.state).toBe("complete");
    await expect(r.getReceipt(a.owner, receipt.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      images.cleanupDeletion(b.owner, status.deletionId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await images.deleteReceipt(b.owner, other.id, 2);
  }, 30000);
  it("recovers an expired persisted attempt", async () => {
    const { owner } = await setup();
    const receipt = await r.createReceipt(owner);
    const attempt = randomUUID();
    await pool.query(
      "INSERT INTO processing_attempts(id,receipt_id,input_version,state,deadline) VALUES($1,$2,1,'processing',now()-interval '1 second')",
      [attempt, receipt.id],
    );
    const got = await r.getReceipt(owner, receipt.id);
    expect(got.processing?.state).toBe("failed");
    expect(got.processing?.errorCode).toBe("OCR_INTERRUPTED");
  });
});
describe("M5 A-DB-3 cleanup fault recovery and snapshot stability", () => {
  it("retries failed file cleanup and keeps historical names after rename/archive", async () => {
    const images = await import("../../src/server/images");
    const { mkdir, writeFile, rm } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const { owner, h } = await setup();
    const receipt = await r.createReceipt(owner);
    await r.saveDraft(owner, receipt.id, graph(1, h.participants[0].id));
    await r.finalize(owner, receipt.id, 2);
    await r.participant(
      owner,
      { expectedHouseholdVersion: h.version, displayName: "Renamed" },
      h.participants[0].id,
    );
    expect(
      (await r.getReceipt(owner, receipt.id)).finalization!.shares[0].name,
    ).toBe("You");
    const key = randomUUID() + "/display.png",
      dir = resolve(process.env.SPLITCART_STORAGE_DIR || ".data/images", key);
    await mkdir(dir, { recursive: true });
    await writeFile(dir + "/blocker", "synthetic");
    const deletion = randomUUID();
    await pool.query(
      "INSERT INTO storage_deletions(id,owner_user_id,state,keys) VALUES($1,$2,'pending',$3)",
      [deletion, owner, JSON.stringify([key])],
    );
    expect((await images.cleanupDeletion(owner, deletion)).state).toBe(
      "failed",
    );
    await rm(dir, { recursive: true });
    expect((await images.cleanupDeletion(owner, deletion)).state).toBe(
      "complete",
    );
    const done = await images.deleteReceipt(owner, receipt.id, 3);
    expect(done.state).toBe("complete");
  });
});
describe("M5 A-UX-3 real cursor history and account metadata", () => {
  it("reaches 21+ receipts and filters purchase dates without exposing another owner", async () => {
    const { owner } = await setup();
    for (let i = 0; i < 21; i++)
      await r.createReceipt(owner, "Synthetic history " + i, "2020-01-01");
    const first = await r.history(owner, { limit: 20 });
    expect(first.receipts).toHaveLength(20);
    expect(first.nextCursor).not.toBeNull();
    const second = await r.history(owner, {
      limit: 20,
      cursor: first.nextCursor!,
    });
    expect(second.receipts).toHaveLength(1);
    expect(
      new Set([...first.receipts, ...second.receipts].map((x) => x.id)).size,
    ).toBe(21);
    expect(
      (await r.history(owner, { limit: 20, from: "2021-01-01" })).receipts,
    ).toHaveLength(0);
    expect(first.receipts.every((x) => x.dateSource === "receipt")).toBe(true);
    const h = await r.household(owner);
    expect(h.account.displayName).toBe("You");
    expect(h.account).not.toHaveProperty("provider_subject");
  });
});
