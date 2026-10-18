import {
  draftSchema,
  type Draft,
  type Participant,
  type Split,
  type ItemAllocation,
} from "./contracts";
import { assert } from "./errors";
import { allocate, cents, MAX_CENTS } from "./money";
export function splitReceipt(input: Draft, participants: Participant[]): Split {
  const d = draftSchema.parse(input);
  const active = new Map(
    participants.filter((p) => !p.archived).map((p) => [p.id, p]),
  );
  assert(
    d.review.confirmed,
    "REVIEW_REQUIRED",
    "Confirm that the receipt was reviewed.",
  );
  assert(
    d.review.lineResolutions.every((l) => l.resolution !== "unsupported"),
    "REVIEW_REQUIRED",
    "Resolve unsupported financial lines.",
  );
  assert(d.items.length > 0, "INVALID_FIELDS", "Add at least one item.");
  assert(
    d.payerParticipantId && active.has(d.payerParticipantId),
    "INVALID_PAYER",
  );
  assert(
    d.reviewedTotalCents !== null,
    "REVIEW_REQUIRED",
    "Enter and confirm the receipt total.",
  );
  const rows = d.items.map((item) => {
    assert(
      item.description.trim(),
      "INVALID_FIELDS",
      "Every item needs a description.",
    );
    assert(
      item.grossCents !== null,
      "REVIEW_REQUIRED",
      "Every item needs a price.",
    );
    const assignments = d.assignments.filter((a) => a.itemId === item.id);
    assert(
      assignments.length > 0,
      "MISSING_ASSIGNMENT",
      "Assign every item to a roommate.",
    );
    assert(
      assignments.every((a) => active.has(a.participantId)),
      "INVALID_PARTICIPANT",
    );
    return {
      item,
      assignments,
      gross: cents(item.grossCents),
      net: cents(item.grossCents),
      positive: 0n,
      discount: 0n,
      adjustments: {} as Record<string, bigint>,
    };
  });
  assert(
    rows.reduce((s, r) => s + r.gross, 0n) <= MAX_CENTS,
    "AMOUNT_TOO_LARGE",
  );
  const byId = new Map(rows.map((r) => [r.item.id, r]));
  const adjustments = [...d.adjustments].sort(
    (a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id),
  );
  for (const a of adjustments)
    assert(
      a.amountCents !== null &&
        a.eligibilityConfirmed &&
        a.targetItemIds.length > 0,
      "REVIEW_REQUIRED",
      "Confirm every adjustment and its eligible items.",
    );
  for (const a of adjustments
    .filter((a) => a.kind === "line_discount" || a.kind === "receipt_discount")
    .sort(
      (a, b) =>
        (a.kind === "line_discount" ? 0 : 1) -
          (b.kind === "line_discount" ? 0 : 1) || a.sequence - b.sequence,
    )) {
    assert(
      a.kind !== "line_discount" || a.targetItemIds.length === 1,
      "INVALID_DISCOUNT",
    );
    const eligible = a.targetItemIds.map((id) => byId.get(id)!);
    const amount = cents(a.amountCents!);
    assert(
      amount <= eligible.reduce((s, r) => s + r.net, 0n),
      "EXCESS_DISCOUNT",
    );
    const parts = allocate(
      amount,
      eligible.map((r) => ({ id: r.item.id, weight: r.net })),
    );
    for (const row of eligible) {
      row.net -= parts[row.item.id];
      row.discount += parts[row.item.id];
      row.adjustments[a.id] = -parts[row.item.id];
    }
  }
  for (const a of adjustments.filter(
    (a) => a.kind === "tax" || a.kind === "fee",
  )) {
    const eligible = a.targetItemIds.map((id) => byId.get(id)!);
    const amount = cents(a.amountCents!);
    const parts = allocate(
      amount,
      eligible.map((r) => ({ id: r.item.id, weight: r.net })),
    );
    for (const row of eligible) {
      row.positive += parts[row.item.id];
      row.adjustments[a.id] = parts[row.item.id];
    }
  }
  const total = rows.reduce((s, r) => s + r.net + r.positive, 0n);
  assert(total <= MAX_CENTS, "AMOUNT_TOO_LARGE");
  assert(
    total === cents(d.reviewedTotalCents),
    "UNRECONCILED",
    "Items and adjustments must equal the receipt total exactly.",
  );
  const totals = new Map<string, bigint>();
  const itemAllocations: ItemAllocation[] = [];
  for (const row of rows) {
    const final = allocate(
      row.net + row.positive,
      row.assignments.map((a) => ({
        id: a.participantId,
        weight: BigInt(a.weight),
      })),
    );
    const net = allocate(
      row.net,
      Object.entries(final).map(([id, weight]) => ({ id, weight })),
    );
    const remaining = Object.fromEntries(
      Object.entries(final).map(([id, v]) => [id, v - net[id]]),
    );
    const components: Record<
      string,
      Record<string, string>
    > = Object.fromEntries(Object.keys(final).map((id) => [id, {}]));
    for (const a of adjustments.filter(
      (a) => a.kind === "tax" || a.kind === "fee",
    )) {
      const amount = row.adjustments[a.id] ?? 0n;
      const part = allocate(
        amount,
        Object.entries(remaining).map(([id, weight]) => ({ id, weight })),
      );
      for (const id of Object.keys(final)) {
        remaining[id] -= part[id];
        components[id][a.id] = part[id].toString();
      }
    }
    for (const [id, amount] of Object.entries(final)) {
      totals.set(id, (totals.get(id) ?? 0n) + amount);
      itemAllocations.push({
        itemId: row.item.id,
        participantId: id,
        netCents: net[id].toString(),
        finalCents: amount.toString(),
        adjustments: components[id],
      });
    }
  }
  if (!totals.has(d.payerParticipantId)) totals.set(d.payerParticipantId, 0n);
  const shares = [...totals.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, amount]) => ({
      participantId: id,
      name: active.get(id)!.displayName,
      finalCents: amount.toString(),
      owedCents: id === d.payerParticipantId ? "0" : amount.toString(),
      isPayer: id === d.payerParticipantId,
    }));
  return {
    policyVersion: "largest-remainder-v1",
    totalCents: total.toString(),
    reimbursementCents: (
      total - (totals.get(d.payerParticipantId) ?? 0n)
    ).toString(),
    shares,
    itemAllocations,
    items: rows.map((r) => ({
      itemId: r.item.id,
      grossCents: r.gross.toString(),
      discountCents: r.discount.toString(),
      netCents: r.net.toString(),
      finalCents: (r.net + r.positive).toString(),
      adjustments: Object.fromEntries(
        Object.entries(r.adjustments).map(([id, n]) => [id, n.toString()]),
      ),
    })),
  };
}
