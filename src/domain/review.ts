// M5 PAR-06/IMG-07: proposals remain unreviewed and never replace an edited draft implicitly.
import type { Draft, Participant } from "./contracts";
import type { OCRResult } from "./ocr-contract";
export function isUntouchedDraft(d: Draft) {
  return (
    !d.items.length &&
    !d.adjustments.length &&
    !d.assignments.length &&
    d.merchant === null &&
    d.purchasedOn === null &&
    d.payerParticipantId === null &&
    d.reviewedTotalCents === null &&
    !d.review.confirmed &&
    d.review.sourceAttemptId === null &&
    !d.review.lineResolutions.length
  );
}
export function candidateDraft(
  d: Draft,
  ocr: OCRResult,
  people: Participant[],
): Draft {
  const c = ocr.candidate,
    known = new Set(
      [...c.items, ...c.adjustments].flatMap((i) => i.sourceLineIds),
    );
  return {
    ...d,
    merchant: d.merchant ?? c.merchant,
    purchasedOn: d.purchasedOn ?? c.purchasedOn,
    payerParticipantId: d.payerParticipantId,
    reviewedTotalCents: c.totalCents,
    items: c.items.map((i) => ({
      id: i.id,
      description: i.description ?? "",
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      grossCents: i.lineTotalCents,
      sourceLineIds: i.sourceLineIds,
    })),
    adjustments: c.adjustments.map((a, i) => ({
      id: a.id,
      sequence: i + 1,
      kind: a.kind,
      label: a.label,
      amountCents: a.amountCents,
      targetItemIds: a.targetItemIds ?? c.items.map((i) => i.id),
      eligibilityConfirmed: false,
    })),
    assignments: c.items.flatMap((i) =>
      people
        .filter((p) => !p.archived)
        .map((p) => ({ itemId: i.id, participantId: p.id, weight: 1 })),
    ),
    review: {
      confirmed: false,
      sourceAttemptId: ocr.attemptId,
      lineResolutions: ocr.lines.map((l) => ({
        lineId: l.id,
        resolution:
          known.has(l.id) || /^(?:sub\s*total|(?:grand )?total)\b/i.test(l.text)
            ? "resolved"
            : /\b(?:cash|change|visa|debit|credit|tender|card)\b/i.test(
                  l.text,
                ) || !/[\d][.,][\d]/.test(l.text)
              ? "metadata"
              : "unsupported",
      })),
    },
  };
}
export function reconciliation(d: Draft) {
  const complete =
    d.items.every((i) => i.grossCents !== null) &&
    d.adjustments.every((a) => a.amountCents !== null);
  const subtotal = d.items.reduce(
      (n, i) => n + BigInt(i.grossCents ?? "0"),
      0n,
    ),
    discounts = d.adjustments
      .filter((a) => a.kind.includes("discount"))
      .reduce((n, a) => n + BigInt(a.amountCents ?? "0"), 0n),
    charges = d.adjustments
      .filter((a) => a.kind === "tax" || a.kind === "fee")
      .reduce((n, a) => n + BigInt(a.amountCents ?? "0"), 0n);
  const calculated = complete ? subtotal - discounts + charges : null,
    difference =
      calculated !== null && d.reviewedTotalCents !== null
        ? calculated - BigInt(d.reviewedTotalCents)
        : null;
  return {
    complete,
    itemsComplete: d.items.every((i) => i.grossCents !== null),
    discountsComplete: d.adjustments
      .filter((a) => a.kind.includes("discount"))
      .every((a) => a.amountCents !== null),
    chargesComplete: d.adjustments
      .filter((a) => a.kind === "tax" || a.kind === "fee")
      .every((a) => a.amountCents !== null),
    subtotal,
    discounts,
    charges,
    calculated,
    difference,
  };
}
const messages: Record<string, string> = {
  LOW_CONFIDENCE: "Some text was hard to read. Double-check the prices.",
  TOTAL_MISSING_OR_AMBIGUOUS:
    "No clear total was found. Enter the printed receipt total.",
  EMPTY_OCR: "No readable text was found. Retry reading or enter the items.",
  QUANTITY_PRICE_CONFLICT:
    "The quantity and unit price do not match the printed line price.",
  MULTIPLE_PRICES:
    "More than one price was found on this line. Check the item cost.",
  WEIGHTED_ITEM_REVIEW:
    "Check this weighted item against its printed line total.",
  ELIGIBILITY_REVIEW_REQUIRED:
    "The eligible items are unknown. Choose and confirm which items this charge or discount applies to.",
  SKEW_UNCERTAIN:
    "The receipt angle could not be verified. Check for missed or distorted text.",
};
export function reviewWarnings(ocr: OCRResult) {
  const warnings = ocr.warnings
    .filter(
      (w) =>
        ![
          "REVIEW_REQUIRED",
          "SKEW_NOT_CORRECTED",
          "BOUNDED_DESKEW_APPLIED",
        ].includes(w.code),
    )
    .map((w) => ({
      key: w.code + ":" + w.lineIds.join(","),
      text: messages[w.code] ?? w.code.replaceAll("_", " ").toLowerCase(),
    }));
  for (const item of ocr.candidate.items)
    for (const code of item.warnings)
      warnings.push({
        key: item.id + code,
        text: `${item.description ?? "Item"}: ${messages[code] ?? code.replaceAll("_", " ").toLowerCase()}`,
      });
  for (const a of ocr.candidate.adjustments)
    for (const code of a.warnings)
      warnings.push({
        key: a.id + code,
        text: `${a.label}: ${messages[code] ?? code.replaceAll("_", " ").toLowerCase()}`,
      });
  return warnings;
}
