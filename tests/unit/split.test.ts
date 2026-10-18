import { describe, it, expect } from "vitest";
import { splitReceipt } from "../../src/domain/split";
import { type Draft, type Participant } from "../../src/domain/contracts";
const ids = Array.from(
  { length: 20 },
  (_, i) => "00000000-0000-4000-8000-" + String(i + 1).padStart(12, "0"),
);
const participants: Participant[] = ids
  .slice(0, 3)
  .map((id, i) => ({ id, displayName: "Roommate " + i, archived: false }));
function draft(gross = "1000", total = gross): Draft {
  return {
    schemaVersion: 1,
    expectedVersion: 1,
    merchant: null,
    purchasedOn: null,
    payerParticipantId: ids[0],
    reviewedTotalCents: total,
    items: [
      {
        id: ids[4],
        description: "Milk",
        quantity: "2",
        unitPriceCents: null,
        grossCents: gross,
        sourceLineIds: [],
      },
    ],
    adjustments: [],
    assignments: participants.map((p) => ({
      itemId: ids[4],
      participantId: p.id,
      weight: 1,
    })),
    review: { confirmed: true, sourceAttemptId: null, lineResolutions: [] },
  };
}
describe("M1 SPL-01..09 A-SPL-1,2", () => {
  it("splits a printed line amount without multiplying quantity", () => {
    const result = splitReceipt(draft(), participants);
    expect(result.shares.map((s) => s.finalCents)).toEqual([
      "334",
      "333",
      "333",
    ]);
    expect(result.reimbursementCents).toBe("666");
  });
  it("applies line then receipt discount then tax", () => {
    const d = draft("1000", "891");
    d.assignments = d.assignments.slice(0, 2);
    d.adjustments = [
      ["line_discount", "100"],
      ["receipt_discount", "90"],
      ["tax", "81"],
    ].map(([kind, amountCents], i) => ({
      id: ids[6 + i],
      sequence: i + 1,
      kind: kind as "tax",
      label: kind,
      amountCents,
      targetItemIds: [ids[4]],
      eligibilityConfirmed: true,
    }));
    const r = splitReceipt(d, participants);
    expect(r.shares.map((s) => s.finalCents)).toEqual(["446", "445"]);
    expect(r.itemAllocations.map((a) => a.netCents)).toEqual(["405", "405"]);
    expect(r.itemAllocations.map((a) => a.adjustments[ids[8]])).toEqual([
      "41",
      "40",
    ]);
  });
  it("blocks mismatches, unreviewed fields, invalid ratios, missing assignments and excess discounts", () => {
    const mismatch = draft("1000", "1001");
    expect(() => splitReceipt(mismatch, participants)).toThrow("equal");
    const unreviewed = draft();
    unreviewed.review.confirmed = false;
    expect(() => splitReceipt(unreviewed, participants)).toThrow("reviewed");
    const missing = draft();
    missing.assignments = [];
    expect(() => splitReceipt(missing, participants)).toThrow("Assign");
    const bad = draft();
    bad.assignments[0].weight = 0;
    expect(() => splitReceipt(bad, participants)).toThrow();
    const excess = draft();
    excess.adjustments = [
      {
        id: ids[6],
        sequence: 1,
        kind: "line_discount",
        label: "Coupon",
        amountCents: "1001",
        targetItemIds: [ids[4]],
        eligibilityConfirmed: true,
      },
    ];
    expect(() => splitReceipt(excess, participants)).toThrow();
  });
  it("reconciles seeded random inputs and every breakdown across reordering", () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed;
    };
    for (let i = 0; i < 300; i++) {
      const gross = BigInt(rand() % 100000),
        tax = BigInt(rand() % 10000);
      const d = draft(gross.toString(), (gross + tax).toString());
      d.assignments.forEach((a) => (a.weight = (rand() % 100) + 1));
      d.adjustments = [
        {
          id: ids[6],
          sequence: 1,
          kind: "tax",
          label: "Tax",
          amountCents: tax.toString(),
          targetItemIds: [ids[4]],
          eligibilityConfirmed: true,
        },
      ];
      if (gross === 0n && tax > 0n) {
        expect(() => splitReceipt(d, participants)).toThrow();
        continue;
      }
      const r = splitReceipt(d, participants);
      expect(r.shares.reduce((s, a) => s + BigInt(a.finalCents), 0n)).toBe(
        gross + tax,
      );
      for (const a of r.itemAllocations)
        expect(
          BigInt(a.netCents) +
            Object.values(a.adjustments).reduce((s, v) => s + BigInt(v), 0n),
        ).toBe(BigInt(a.finalCents));
      d.assignments.reverse();
      expect(splitReceipt(d, participants).shares).toEqual(r.shares);
    }
  });
});
describe("M1 A-SPL-1,2 extended vectors and invalid graphs", () => {
  it("distributes receipt discounts and mixed taxes by item net values", () => {
    const d = draft("1000", "1500");
    d.items.push({ ...d.items[0], id: ids[5], grossCents: "500" });
    d.assignments = [
      { itemId: ids[4], participantId: ids[0], weight: 1 },
      { itemId: ids[5], participantId: ids[1], weight: 1 },
    ];
    d.adjustments = [
      {
        id: ids[6],
        sequence: 1,
        kind: "receipt_discount",
        label: "Coupon",
        amountCents: "100",
        targetItemIds: [ids[4], ids[5]],
        eligibilityConfirmed: true,
      },
      {
        id: ids[7],
        sequence: 2,
        kind: "tax",
        label: "Tax",
        amountCents: "100",
        targetItemIds: [ids[4], ids[5]],
        eligibilityConfirmed: true,
      },
    ];
    const r = splitReceipt(d, participants);
    expect(
      r.items.map((i) => [i.discountCents, i.netCents, i.finalCents]),
    ).toEqual([
      ["67", "933", "1000"],
      ["33", "467", "500"],
    ]);
    expect(r.shares.map((s) => s.finalCents)).toEqual(["1000", "500"]);
  });
  it("handles zero, caps, archived people, duplicates, orphans and zero-net tax", () => {
    const zero = draft("0");
    expect(splitReceipt(zero, participants).totalCents).toBe("0");
    expect(splitReceipt(draft("100000000"), participants).totalCents).toBe(
      "100000000",
    );
    const cap = draft("100000001");
    expect(() => splitReceipt(cap, participants)).toThrow();
    expect(() =>
      splitReceipt(
        draft(),
        participants.map((p) => ({ ...p, archived: true })),
      ),
    ).toThrow();
    const dup = draft();
    dup.assignments.push({ ...dup.assignments[0] });
    expect(() => splitReceipt(dup, participants)).toThrow();
    const orphan = draft();
    orphan.assignments[0].itemId = ids[19];
    expect(() => splitReceipt(orphan, participants)).toThrow();
    const tax = draft("0", "1");
    tax.adjustments = [
      {
        id: ids[6],
        sequence: 1,
        kind: "tax",
        label: "Tax",
        amountCents: "1",
        targetItemIds: [ids[4]],
        eligibilityConfirmed: true,
      },
    ];
    expect(() => splitReceipt(tax, participants)).toThrow();
  });
  it("keeps multiple positive components within final capacities", () => {
    const d = draft("1", "4");
    d.adjustments = ["1", "2"].map((amountCents, i) => ({
      id: ids[6 + i],
      sequence: i + 1,
      kind: i ? "fee" : "tax",
      label: "Charge",
      amountCents,
      targetItemIds: [ids[4]],
      eligibilityConfirmed: true,
    }));
    const r = splitReceipt(d, participants);
    for (const a of r.itemAllocations)
      expect(
        BigInt(a.netCents) +
          Object.values(a.adjustments).reduce((s, v) => s + BigInt(v), 0n),
      ).toBe(BigInt(a.finalCents));
    for (const a of d.adjustments)
      expect(
        r.itemAllocations.reduce(
          (sum, x) => sum + BigInt(x.adjustments[a.id]),
          0n,
        ),
      ).toBe(BigInt(a.amountCents!));
  });
});

it("M1 A-SPL-1 printed quantity vector remains 349 cents", () => {
  const d = draft("349");
  expect(splitReceipt(d, participants).totalCents).toBe("349");
});
