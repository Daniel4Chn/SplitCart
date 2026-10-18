import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool, transaction } from "./db";
import { AppError } from "@/domain/errors";
import {
  draftSchema,
  splitSchema,
  type Draft,
  type Participant,
} from "@/domain/contracts";
import { ocrSchema } from "@/domain/ocr-contract";
import { splitReceipt } from "@/domain/split";
export async function ensureOwner(
  provider: string,
  subject: string,
  name = "You",
) {
  return transaction(async (db) => {
    const result = await db.query(
      "INSERT INTO users(id,provider,provider_subject,display_name) VALUES($1,$2,$3,$4) ON CONFLICT(provider,provider_subject) DO UPDATE SET display_name=EXCLUDED.display_name RETURNING id",
      [randomUUID(), provider, subject, name],
    );
    const owner = result.rows[0].id as string;
    await db.query(
      "INSERT INTO households(id,owner_user_id,name) VALUES($1,$2,'My roommates') ON CONFLICT(owner_user_id) DO NOTHING",
      [randomUUID(), owner],
    );
    const household = (
      await db.query(
        "SELECT id FROM households WHERE owner_user_id=$1 FOR UPDATE",
        [owner],
      )
    ).rows[0].id;
    if (
      !(
        await db.query("SELECT 1 FROM participants WHERE household_id=$1", [
          household,
        ])
      ).rowCount
    )
      await db.query(
        "INSERT INTO participants(id,household_id,display_name) VALUES($1,$2,'You')",
        [randomUUID(), household],
      );
    return owner;
  });
}
export async function household(
  owner: string,
  db: PoolClient | typeof pool = pool,
): Promise<{
  id: string;
  name: string;
  version: number;
  participants: Participant[];
  account: { displayName: string; mode: "development" | "google" };
}> {
  const row = (
    await db.query(
      "SELECT h.id,h.name,h.version,u.display_name AS owner_name,u.provider FROM households h JOIN users u ON u.id=h.owner_user_id WHERE h.owner_user_id=$1",
      [owner],
    )
  ).rows[0];
  if (!row) throw new AppError("NOT_FOUND", 404);
  const people = await db.query(
    "SELECT id,display_name,archived_at FROM participants WHERE household_id=$1 ORDER BY display_name,id",
    [row.id],
  );
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    account: {
      displayName: row.owner_name ?? "You",
      mode: row.provider === "development" ? "development" : "google",
    },
    participants: people.rows.map((p) => ({
      id: p.id,
      displayName: p.display_name,
      archived: p.archived_at !== null,
    })) as Participant[],
  };
}
export async function participant(
  owner: string,
  input: {
    displayName?: string;
    archived?: boolean;
    expectedHouseholdVersion: number;
  },
  id?: string,
) {
  return transaction(async (db) => {
    const h = (
      await db.query(
        "SELECT * FROM households WHERE owner_user_id=$1 FOR UPDATE",
        [owner],
      )
    ).rows[0];
    if (h.version !== input.expectedHouseholdVersion)
      throw new AppError("VERSION_CONFLICT", 409);
    if (id) {
      const result = await db.query(
        "UPDATE participants SET display_name=COALESCE($1,display_name),archived_at=CASE WHEN $2::boolean IS NULL THEN archived_at WHEN $2 THEN now() ELSE NULL END WHERE id=$3 AND household_id=$4 RETURNING id",
        [input.displayName ?? null, input.archived ?? null, id, h.id],
      );
      if (!result.rowCount) throw new AppError("NOT_FOUND", 404);
    } else {
      if (
        (
          await db.query(
            "SELECT count(*) FROM participants WHERE household_id=$1 AND archived_at IS NULL",
            [h.id],
          )
        ).rows[0].count >= 50
      )
        throw new AppError("PARTICIPANT_LIMIT");
      await db.query(
        "INSERT INTO participants(id,household_id,display_name) VALUES($1,$2,$3)",
        [randomUUID(), h.id, input.displayName],
      );
    }
    await db.query("UPDATE households SET version=version+1 WHERE id=$1", [
      h.id,
    ]);
    return household(owner, db);
  });
}
export async function createReceipt(
  owner: string,
  merchant: string | null = null,
  purchasedOn: string | null = null,
) {
  const h = await household(owner);
  const id = randomUUID();
  await pool.query(
    "INSERT INTO receipts(id,household_id,merchant,purchased_on) VALUES($1,$2,$3,$4)",
    [id, h.id, merchant, purchasedOn],
  );
  return getReceipt(owner, id);
}
export async function ownedRow(
  owner: string,
  id: string,
  db: PoolClient | typeof pool = pool,
  lock = false,
) {
  const result = await db.query(
    "SELECT r.* FROM receipts r JOIN households h ON h.id=r.household_id WHERE r.id=$1 AND h.owner_user_id=$2" +
      (lock ? " FOR UPDATE OF r" : ""),
    [id, owner],
  );
  if (!result.rowCount) throw new AppError("NOT_FOUND", 404);
  return result.rows[0];
}
export function checkVersion(
  row: { version: number; status: string },
  version: number,
) {
  if (row.status !== "draft") throw new AppError("FINALIZED", 409);
  if (row.version !== version) throw new AppError("VERSION_CONFLICT", 409);
}
export async function getReceipt(
  owner: string,
  id: string,
  db: PoolClient | typeof pool = pool,
) {
  const row = await ownedRow(owner, id, db);
  await db.query(
    "UPDATE processing_attempts SET state='failed',error_code='OCR_INTERRUPTED',ended_at=now() WHERE receipt_id=$1 AND state='processing' AND deadline<now()",
    [id],
  );
  const items = await db.query(
    "SELECT * FROM items WHERE receipt_id=$1 ORDER BY sequence",
    [id],
  );
  const adjustments = await db.query(
    "SELECT a.*,COALESCE((SELECT jsonb_agg(t.item_id ORDER BY t.item_id) FROM adjustment_targets t WHERE t.adjustment_id=a.id),'[]') AS targets FROM adjustments a WHERE a.receipt_id=$1 ORDER BY sequence",
    [id],
  );
  const assignments = await db.query(
    "SELECT item_id,participant_id,weight FROM assignments WHERE receipt_id=$1 ORDER BY item_id,participant_id",
    [id],
  );
  const final = await db.query(
    "SELECT * FROM finalizations WHERE receipt_id=$1",
    [id],
  );
  const draft: Draft = {
    schemaVersion: 1,
    expectedVersion: row.version,
    merchant: row.merchant,
    purchasedOn: row.purchased_on
      ? String(row.purchased_on.getFullYear()).padStart(4, "0") +
        "-" +
        String(row.purchased_on.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(row.purchased_on.getDate()).padStart(2, "0")
      : null,
    payerParticipantId: row.payer_participant_id,
    reviewedTotalCents: row.reviewed_total_cents,
    review: row.review,
    items: items.rows.map((i) => ({
      id: i.id,
      description: i.description,
      quantity: i.quantity,
      unitPriceCents: i.unit_price_cents,
      grossCents: i.gross_cents,
      sourceLineIds: i.source_line_ids,
    })),
    adjustments: adjustments.rows.map((a) => ({
      id: a.id,
      sequence: a.sequence,
      kind: a.kind,
      label: a.label,
      amountCents: a.amount_cents,
      targetItemIds: a.targets,
      eligibilityConfirmed: a.eligibility_confirmed,
    })),
    assignments: assignments.rows.map((a) => ({
      itemId: a.item_id,
      participantId: a.participant_id,
      weight: a.weight,
    })),
  };
  const image = (
    await db.query("SELECT id FROM receipt_images WHERE receipt_id=$1", [id])
  ).rows[0];
  const attempt = (
    await db.query(
      "SELECT id,input_version,state,result,error_code FROM processing_attempts WHERE receipt_id=$1 ORDER BY started_at DESC,id DESC LIMIT 1",
      [id],
    )
  ).rows[0];
  const reviewSource = draft.review.sourceAttemptId
    ? ((
        await db.query(
          "SELECT result FROM processing_attempts WHERE id=$1 AND receipt_id=$2 AND state='succeeded'",
          [draft.review.sourceAttemptId, id],
        )
      ).rows[0]?.result ?? null)
    : null;
  return {
    reviewSource: reviewSource ? ocrSchema.parse(reviewSource) : null,
    image: image ? { url: "/api/v1/receipts/" + id + "/image" } : null,
    processing: attempt
      ? {
          id: attempt.id,
          inputVersion: attempt.input_version,
          state: attempt.state,
          result: attempt.result ? ocrSchema.parse(attempt.result) : null,
          errorCode: attempt.error_code,
        }
      : null,
    id,
    status: row.status,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    draft: draftSchema.parse(draft),
    finalization: final.rows[0]
      ? {
          id: final.rows[0].id,
          inputVersion: final.rows[0].input_version,
          ...splitSchema.parse(final.rows[0].snapshot),
        }
      : null,
  };
}
export async function saveDraft(owner: string, id: string, input: unknown) {
  const d = draftSchema.parse(input);
  return transaction(async (db) => {
    const row = await ownedRow(owner, id, db, true);
    checkVersion(row, d.expectedVersion);
    if (d.review.sourceAttemptId) {
      const attempt = (
        await db.query(
          "SELECT result FROM processing_attempts WHERE id=$1 AND receipt_id=$2 AND state='succeeded'",
          [d.review.sourceAttemptId, id],
        )
      ).rows[0];
      if (!attempt) throw new AppError("INVALID_SOURCE", 422);
      const result = ocrSchema.parse(attempt.result);
      const sourceLines = new Set(result.lines.map((l) => l.id));
      if (
        d.items.some((i) =>
          i.sourceLineIds.some((id) => !sourceLines.has(id)),
        ) ||
        d.review.lineResolutions.some((l) => !sourceLines.has(l.lineId))
      )
        throw new AppError("INVALID_SOURCE", 422);
      const resolutions = new Map(
        d.review.lineResolutions.map((l) => [l.lineId, l.resolution]),
      );
      if (
        d.review.confirmed &&
        result.lines.some(
          (l) =>
            !resolutions.has(l.id) || resolutions.get(l.id) === "unsupported",
        )
      )
        throw new AppError(
          "REVIEW_REQUIRED",
          422,
          "Resolve every source line before confirming review.",
        );
    } else if (d.items.some((i) => i.sourceLineIds.length))
      throw new AppError("INVALID_SOURCE", 422);
    const h = await household(owner, db);
    const active = new Set(
      h.participants.filter((p) => !p.archived).map((p) => p.id),
    );
    if (
      (d.payerParticipantId && !active.has(d.payerParticipantId)) ||
      d.assignments.some((a) => !active.has(a.participantId))
    )
      throw new AppError("INVALID_PARTICIPANT");
    // Identifiers from other receipts may never be moved by graph replacement.
    const allIds = [
      ...d.items.map((i) => i.id),
      ...d.adjustments.map((a) => a.id),
    ];
    if (allIds.length) {
      const foreign = await db.query(
        "SELECT id FROM items WHERE id=ANY($1::uuid[]) AND receipt_id<>$2 UNION SELECT id FROM adjustments WHERE id=ANY($1::uuid[]) AND receipt_id<>$2",
        [allIds, id],
      );
      if (foreign.rowCount) throw new AppError("INVALID_FIELDS");
    }
    for (const a of d.adjustments) {
      const existing = await db.query(
        "SELECT sequence FROM adjustments WHERE id=$1 AND receipt_id=$2",
        [a.id, id],
      );
      if (existing.rowCount && existing.rows[0].sequence !== a.sequence)
        throw new AppError(
          "INVALID_FIELDS",
          422,
          "Existing adjustment sequence cannot change.",
        );
    }
    await db.query("DELETE FROM adjustments WHERE receipt_id=$1", [id]);
    await db.query("DELETE FROM items WHERE receipt_id=$1", [id]);
    for (const [sequence, i] of d.items.entries())
      await db.query(
        "INSERT INTO items(id,receipt_id,household_id,sequence,description,quantity,unit_price_cents,gross_cents,source_line_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          i.id,
          id,
          row.household_id,
          sequence,
          i.description,
          i.quantity,
          i.unitPriceCents,
          i.grossCents,
          JSON.stringify(i.sourceLineIds),
        ],
      );
    for (const a of d.adjustments) {
      await db.query(
        "INSERT INTO adjustments(id,receipt_id,household_id,sequence,kind,label,amount_cents,eligibility_confirmed) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          a.id,
          id,
          row.household_id,
          a.sequence,
          a.kind,
          a.label,
          a.amountCents,
          a.eligibilityConfirmed,
        ],
      );
      for (const itemId of a.targetItemIds)
        await db.query(
          "INSERT INTO adjustment_targets(adjustment_id,item_id,receipt_id,household_id) VALUES($1,$2,$3,$4)",
          [a.id, itemId, id, row.household_id],
        );
    }
    for (const a of d.assignments)
      await db.query(
        "INSERT INTO assignments(item_id,participant_id,receipt_id,household_id,weight) VALUES($1,$2,$3,$4,$5)",
        [a.itemId, a.participantId, id, row.household_id, a.weight],
      );
    await db.query(
      "UPDATE receipts SET merchant=$1,purchased_on=$2,payer_participant_id=$3,reviewed_total_cents=$4,review=$5,version=version+1,updated_at=now() WHERE id=$6",
      [
        d.merchant,
        d.purchasedOn,
        d.payerParticipantId,
        d.reviewedTotalCents,
        JSON.stringify(d.review),
        id,
      ],
    );
    return getReceipt(owner, id, db);
  });
}
export async function preview(owner: string, id: string, version: number) {
  const r = await getReceipt(owner, id);
  checkVersion(r, version);
  const h = await household(owner);
  return splitReceipt(r.draft, h.participants);
}
export async function finalize(owner: string, id: string, version: number) {
  return transaction(async (db) => {
    const row = await ownedRow(owner, id, db, true);
    if (row.status === "finalized") {
      const r = await getReceipt(owner, id, db);
      if (!r.finalization) throw new AppError("INTERNAL_ERROR", 500);
      if (r.finalization.inputVersion === version)
        return { created: false, receipt: r };
      throw new AppError("VERSION_CONFLICT", 409);
    }
    checkVersion(row, version);
    const r = await getReceipt(owner, id, db);
    const h = await household(owner, db);
    const split = splitReceipt(r.draft, h.participants);
    const fid = randomUUID();
    await db.query(
      "INSERT INTO finalizations(id,receipt_id,input_version,policy_version,total_cents,reviewed_input,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        fid,
        id,
        version,
        split.policyVersion,
        split.totalCents,
        JSON.stringify(r.draft),
        JSON.stringify(split),
      ],
    );
    for (const s of split.shares)
      await db.query(
        "INSERT INTO share_rows(finalization_id,participant_id,participant_name_snapshot,final_cents,is_payer) VALUES($1,$2,$3,$4,$5)",
        [fid, s.participantId, s.name, s.finalCents, s.isPayer],
      );
    for (const a of split.itemAllocations)
      await db.query(
        "INSERT INTO item_allocation_rows(finalization_id,item_id,participant_id,net_cents,final_cents,adjustment_breakdown) VALUES($1,$2,$3,$4,$5,$6)",
        [
          fid,
          a.itemId,
          a.participantId,
          a.netCents,
          a.finalCents,
          JSON.stringify(a.adjustments),
        ],
      );
    await db.query(
      "UPDATE receipts SET status='finalized',version=version+1,updated_at=now() WHERE id=$1",
      [id],
    );
    return { created: true, receipt: await getReceipt(owner, id, db) };
  });
}
export async function history(
  owner: string,
  opts: { cursor?: string; from?: string; to?: string; limit: number },
) {
  const h = await household(owner);
  let cursor: { time: string; id: string } | null = null;
  if (opts.cursor) {
    try {
      cursor = JSON.parse(Buffer.from(opts.cursor, "base64url").toString());
      if (
        !cursor ||
        !/^\d{4}-/.test(cursor.time) ||
        !/^[0-9a-f-]{36}$/.test(cursor.id)
      )
        throw Error();
    } catch {
      throw new AppError("INVALID_CURSOR", 400);
    }
  }
  const result = await pool.query(
    "SELECT r.id,r.merchant,r.status,r.created_at,r.purchased_on,f.snapshot FROM receipts r LEFT JOIN finalizations f ON f.receipt_id=r.id WHERE r.household_id=$1 AND ($2::date IS NULL OR COALESCE(r.purchased_on,r.created_at::date)>=$2) AND ($3::date IS NULL OR COALESCE(r.purchased_on,r.created_at::date)<=$3) AND ($4::timestamptz IS NULL OR (r.created_at,r.id)<($4::timestamptz,$5::uuid)) ORDER BY r.created_at DESC,r.id DESC LIMIT $6",
    [
      h.id,
      opts.from ?? null,
      opts.to ?? null,
      cursor?.time ?? null,
      cursor?.id ?? null,
      opts.limit + 1,
    ],
  );
  const hasMore = result.rows.length > opts.limit;
  const rows = result.rows.slice(0, opts.limit);
  const last = rows.at(-1);
  return {
    receipts: rows.map((r) => ({
      id: r.id,
      merchant: r.merchant,
      status: r.status,
      date: r.purchased_on ?? r.created_at,
      dateSource: r.purchased_on ? "receipt" : "created",
      finalization: r.snapshot ? splitSchema.parse(r.snapshot) : null,
    })),
    nextCursor:
      hasMore && last
        ? Buffer.from(
            JSON.stringify({
              time: last.created_at.toISOString(),
              id: last.id,
            }),
          ).toString("base64url")
        : null,
  };
}
