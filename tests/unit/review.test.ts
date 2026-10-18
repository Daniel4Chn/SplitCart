import { describe, it, expect } from "vitest";
import {
  candidateDraft,
  isUntouchedDraft,
  reconciliation,
  reviewWarnings,
} from "../../src/domain/review";
import type { Draft } from "../../src/domain/contracts";
import type { OCRResult } from "../../src/domain/ocr-contract";
const item = "00000000-0000-4000-8000-000000000001",
  person = "00000000-0000-4000-8000-000000000002",
  attempt = "00000000-0000-4000-8000-000000000003";
const empty = (): Draft => ({
  schemaVersion: 1,
  expectedVersion: 2,
  merchant: null,
  purchasedOn: null,
  payerParticipantId: null,
  reviewedTotalCents: null,
  items: [],
  adjustments: [],
  assignments: [],
  review: { confirmed: false, sourceAttemptId: null, lineResolutions: [] },
});
const ocr: OCRResult = {
  schemaVersion: 1,
  attemptId: attempt,
  status: "ok",
  image: {
    width: 800,
    height: 650,
    coordinateSpace: "normalized-display",
    transform: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  },
  tokens: [],
  lines: [
    { id: "l1", text: "MILK 3.49", tokenIds: [] },
    { id: "l2", text: "TAX 0.51", tokenIds: [] },
  ],
  candidate: {
    currency: "USD",
    merchant: null,
    purchasedOn: null,
    subtotalCents: null,
    totalCents: "400",
    items: [
      {
        id: item,
        description: "MILK",
        quantity: null,
        unitPriceCents: null,
        lineTotalCents: "349",
        sourceLineIds: ["l1"],
        warnings: ["MULTIPLE_PRICES"],
      },
    ],
    adjustments: [
      {
        id: person,
        kind: "tax",
        label: "Tax",
        amountCents: "51",
        targetItemIds: null,
        sourceLineIds: ["l2"],
        warnings: ["ELIGIBILITY_REVIEW_REQUIRED"],
      },
    ],
    unparsedLineIds: [],
  },
  warnings: [{ code: "LOW_CONFIDENCE", lineIds: ["l1"] }],
  engine: {
    processorVersion: "synthetic",
    parserVersion: "synthetic",
    tesseractVersion: "synthetic",
    languageDataVersion: "synthetic",
    candidate: "baseline",
    selectionReason: "test",
  },
};
describe("M5 A-UX-2 IMG-07 review safety and recovery", () => {
  it("only recognizes a completely untouched draft as safe for automatic recovery", () => {
    expect(isUntouchedDraft(empty())).toBe(true);
    for (const change of [
      { merchant: "Edited" },
      { payerParticipantId: person },
      { reviewedTotalCents: "0" },
      { purchasedOn: "2026-10-17" },
    ])
      expect(isUntouchedDraft({ ...empty(), ...change })).toBe(false);
  });
  it("never picks an alphabetical payer or confirms unknown tax eligibility", () => {
    const d = candidateDraft(empty(), ocr, [
      { id: person, displayName: "Alex", archived: false },
    ]);
    expect(d.payerParticipantId).toBeNull();
    expect(d.adjustments[0].targetItemIds).toEqual([item]);
    expect(d.adjustments[0].eligibilityConfirmed).toBe(false);
    expect(d.review.confirmed).toBe(false);
    expect(d.review.sourceAttemptId).toBe(attempt);
  });
  it("reports exact differences and unknown amounts without balancing or floating point", () => {
    const d = candidateDraft(empty(), ocr, []);
    expect(reconciliation(d).difference).toBe(0n);
    d.reviewedTotalCents = "399";
    expect(reconciliation(d).difference).toBe(1n);
    d.adjustments[0].amountCents = null;
    expect(reconciliation(d).chargesComplete).toBe(false);
    expect(reconciliation(d).itemsComplete).toBe(true);
    expect(reconciliation(d).difference).toBeNull();
    d.items[0].grossCents = null;
    expect(reconciliation(d).difference).toBeNull();
  });
  it("surfaces image, item and adjustment uncertainty", () => {
    const text = reviewWarnings(ocr)
      .map((w) => w.text)
      .join(" ");
    expect(text).toContain("hard to read");
    expect(text).toContain("More than one price");
    expect(text).toContain("eligible items are unknown");
  });
});
