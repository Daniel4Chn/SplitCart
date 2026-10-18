import { z } from "zod";
export const idSchema = z.uuid();
export const moneySchema = z
  .string()
  .max(9)
  .regex(/^(0|[1-9]\d*)$/)
  .refine((v) => BigInt(v) <= 100_000_000n, "Amount exceeds limit");
const nullableMoney = moneySchema.nullable();
export const itemSchema = z
  .object({
    id: idSchema,
    description: z.string().max(240),
    quantity: z
      .string()
      .regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/)
      .refine((v) => /[1-9]/.test(v), "Must be positive")
      .nullable(),
    unitPriceCents: nullableMoney,
    grossCents: nullableMoney,
    sourceLineIds: z.array(z.string().max(80)).max(100),
  })
  .strict();
export const adjustmentSchema = z
  .object({
    id: idSchema,
    sequence: z.int().min(1).max(10000),
    kind: z.enum(["line_discount", "receipt_discount", "tax", "fee"]),
    label: z.string().trim().min(1).max(120),
    amountCents: nullableMoney,
    targetItemIds: z.array(idSchema).max(500),
    eligibilityConfirmed: z.boolean(),
  })
  .strict();
export const assignmentSchema = z
  .object({
    itemId: idSchema,
    participantId: idSchema,
    weight: z.int().min(1).max(10000),
  })
  .strict();
export const reviewSchema = z
  .object({
    confirmed: z.boolean(),
    sourceAttemptId: idSchema.nullable(),
    lineResolutions: z
      .array(
        z
          .object({
            lineId: z.string().max(80),
            resolution: z.enum(["resolved", "metadata", "unsupported"]),
          })
          .strict(),
      )
      .max(2000),
  })
  .strict();
export const draftSchema = z
  .object({
    schemaVersion: z.literal(1),
    expectedVersion: z.int().min(1),
    merchant: z.string().max(160).nullable(),
    purchasedOn: z.iso.date().nullable(),
    payerParticipantId: idSchema.nullable(),
    reviewedTotalCents: nullableMoney,
    items: z.array(itemSchema).max(500),
    adjustments: z.array(adjustmentSchema).max(100),
    assignments: z.array(assignmentSchema).max(25000),
    review: reviewSchema,
  })
  .strict()
  .superRefine((d, ctx) => {
    const unique = (list: string[], path: string) => {
      if (new Set(list).size !== list.length)
        ctx.addIssue({
          code: "custom",
          path: [path],
          message: "Duplicate identifier",
        });
    };
    unique(
      d.items.map((x) => x.id),
      "items",
    );
    unique(
      d.adjustments.map((x) => x.id),
      "adjustments",
    );
    unique(
      d.adjustments.map((x) => String(x.sequence)),
      "adjustments",
    );
    unique(
      d.assignments.map((x) => x.itemId + ":" + x.participantId),
      "assignments",
    );
    unique(
      d.review.lineResolutions.map((x) => x.lineId),
      "review",
    );
    const ids = new Set(d.items.map((x) => x.id));
    for (const a of d.adjustments) {
      unique(a.targetItemIds, "adjustments");
      if (a.targetItemIds.some((id) => !ids.has(id)))
        ctx.addIssue({
          code: "custom",
          path: ["adjustments"],
          message: "Unknown target item",
        });
    }
    if (d.assignments.some((a) => !ids.has(a.itemId)))
      ctx.addIssue({
        code: "custom",
        path: ["assignments"],
        message: "Unknown item",
      });
  });
export type Draft = z.infer<typeof draftSchema>;
export type Participant = {
  id: string;
  displayName: string;
  archived: boolean;
};
export type Share = {
  participantId: string;
  name: string;
  finalCents: string;
  owedCents: string;
  isPayer: boolean;
};
export type ItemAllocation = {
  itemId: string;
  participantId: string;
  netCents: string;
  finalCents: string;
  adjustments: Record<string, string>;
};
export type Split = {
  policyVersion: string;
  totalCents: string;
  reimbursementCents: string;
  shares: Share[];
  itemAllocations: ItemAllocation[];
  items: {
    itemId: string;
    grossCents: string;
    discountCents: string;
    netCents: string;
    finalCents: string;
    adjustments: Record<string, string>;
  }[];
};

// DB-01/API-01: persisted snapshots are validated again when crossing the server boundary.
const breakdownSchema = z.record(
  idSchema,
  z
    .string()
    .max(10)
    .regex(/^-?(0|[1-9]\d*)$/)
    .refine((v) => {
      const n = BigInt(v);
      return n >= -100_000_000n && n <= 100_000_000n;
    }),
);
export const splitSchema = z
  .object({
    policyVersion: z.literal("largest-remainder-v1"),
    totalCents: moneySchema,
    reimbursementCents: moneySchema,
    shares: z
      .array(
        z
          .object({
            participantId: idSchema,
            name: z.string().max(80),
            finalCents: moneySchema,
            owedCents: moneySchema,
            isPayer: z.boolean(),
          })
          .strict(),
      )
      .max(50),
    itemAllocations: z
      .array(
        z
          .object({
            itemId: idSchema,
            participantId: idSchema,
            netCents: moneySchema,
            finalCents: moneySchema,
            adjustments: breakdownSchema,
          })
          .strict(),
      )
      .max(25000),
    items: z
      .array(
        z
          .object({
            itemId: idSchema,
            grossCents: moneySchema,
            discountCents: moneySchema,
            netCents: moneySchema,
            finalCents: moneySchema,
            adjustments: breakdownSchema,
          })
          .strict(),
      )
      .max(500),
  })
  .strict();
