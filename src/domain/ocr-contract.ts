import { z } from "zod";
import { idSchema, moneySchema } from "./contracts";
const source = z.array(z.string().min(1).max(80)).max(2000);
const nullable = moneySchema.nullable();
const image = z
  .object({
    width: z.int().positive().max(12000),
    height: z.int().positive().max(12000),
    coordinateSpace: z.literal("normalized-display"),
    transform: z.array(z.number().finite()).length(9),
  })
  .strict()
  .refine((i) => i.width * i.height <= 25_000_000);
const warning = z
  .object({ code: z.string().max(100), lineIds: source })
  .strict();
export const candidateSchema = z
  .object({
    currency: z.literal("USD"),
    merchant: z.string().max(160).nullable(),
    purchasedOn: z.iso.date().nullable(),
    items: z
      .array(
        z
          .object({
            id: idSchema,
            description: z.string().max(240).nullable(),
            quantity: z
              .string()
              .regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/)
              .refine((v) => /[1-9]/.test(v), "Quantity must be positive")
              .nullable(),
            unitPriceCents: nullable,
            lineTotalCents: nullable,
            sourceLineIds: source,
            warnings: z.array(z.string().max(100)).max(100),
          })
          .strict(),
      )
      .max(500),
    subtotalCents: nullable,
    totalCents: nullable,
    adjustments: z
      .array(
        z
          .object({
            id: idSchema,
            kind: z.enum(["line_discount", "receipt_discount", "tax", "fee"]),
            label: z.string().max(120),
            amountCents: nullable,
            targetItemIds: z.array(idSchema).max(500).nullable(),
            sourceLineIds: source,
            warnings: z.array(z.string().max(100)).max(100),
          })
          .strict(),
      )
      .max(100),
    unparsedLineIds: source,
  })
  .strict();
const base = { schemaVersion: z.literal(1), attemptId: idSchema };
export const validatedSchema = z
  .object({ ...base, status: z.literal("validated"), image })
  .strict();
export const ocrSchema = z
  .object({
    ...base,
    status: z.literal("ok"),
    image,
    tokens: z
      .array(
        z
          .object({
            id: z.string().max(80),
            text: z.string().max(500),
            confidence: z.int().min(0).max(100).nullable(),
            box: z.tuple([
              z.int().nonnegative(),
              z.int().nonnegative(),
              z.int().nonnegative(),
              z.int().nonnegative(),
            ]),
            lineId: z.string().max(80),
          })
          .strict(),
      )
      .max(15000),
    lines: z
      .array(
        z
          .object({
            id: z.string().max(80),
            text: z.string().max(10000),
            tokenIds: source,
          })
          .strict(),
      )
      .max(2000),
    candidate: candidateSchema,
    warnings: z.array(warning).max(1000),
    engine: z
      .object({
        processorVersion: z.string().max(100),
        parserVersion: z.string().max(100),
        tesseractVersion: z.string().max(200),
        languageDataVersion: z.string().max(100),
        candidate: z.enum(["baseline", "threshold"]),
        selectionReason: z.string().max(200),
      })
      .strict(),
  })
  .strict()
  .superRefine((d, c) => {
    const lines = new Set(d.lines.map((l) => l.id)),
      tokens = new Set(d.tokens.map((t) => t.id)),
      items = new Set(d.candidate.items.map((i) => i.id));
    if (
      lines.size !== d.lines.length ||
      tokens.size !== d.tokens.length ||
      items.size !== d.candidate.items.length ||
      new Set(d.candidate.adjustments.map((a) => a.id)).size !==
        d.candidate.adjustments.length ||
      d.warnings.some((w) => w.lineIds.some((id) => !lines.has(id))) ||
      d.tokens.some(
        (t) =>
          !lines.has(t.lineId) ||
          t.box[0] + t.box[2] > d.image.width ||
          t.box[1] + t.box[3] > d.image.height,
      ) ||
      d.lines.some((l) => l.tokenIds.some((id) => !tokens.has(id))) ||
      [...d.candidate.items, ...d.candidate.adjustments].some((x) =>
        x.sourceLineIds.some((id) => !lines.has(id)),
      ) ||
      d.candidate.unparsedLineIds.some((id) => !lines.has(id)) ||
      d.candidate.adjustments.some((a) =>
        a.targetItemIds?.some((id) => !items.has(id)),
      )
    )
      c.addIssue({ code: "custom", message: "Invalid OCR graph" });
  });
export type OCRResult = z.infer<typeof ocrSchema>;
export const workerErrorSchema = z
  .object({
    schemaVersion: z.literal(1),
    attemptId: idSchema,
    status: z.literal("error"),
    error: z
      .object({
        code: z.enum(["IMAGE_UNREADABLE", "OCR_FAILED"]),
        message: z.string().max(200),
      })
      .strict(),
    warnings: z.array(warning).max(1000),
  })
  .strict();
