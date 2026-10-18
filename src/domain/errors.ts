export class AppError extends Error {
  constructor(
    public code: string,
    public status = 422,
    message = code.replaceAll("_", " ").toLowerCase(),
    public fieldErrors: { path: string; code: string }[] = [],
  ) {
    super(message);
  }
}
export function assert(
  condition: unknown,
  code: string,
  message?: string,
): asserts condition {
  if (!condition) {
    const paths: Record<string, string> = {
      REVIEW_REQUIRED: "review",
      INVALID_FIELDS: "items",
      INVALID_PAYER: "payerParticipantId",
      MISSING_ASSIGNMENT: "assignments",
      INVALID_PARTICIPANT: "assignments",
      INVALID_DISCOUNT: "adjustments",
      EXCESS_DISCOUNT: "adjustments",
      AMOUNT_TOO_LARGE: "reviewedTotalCents",
      UNRECONCILED: "reviewedTotalCents",
    };
    throw new AppError(code, 422, message, [
      { path: paths[code] ?? "items", code },
    ]);
  }
}
