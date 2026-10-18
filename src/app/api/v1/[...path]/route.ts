import { z } from "zod";
import { ownerFor } from "@/server/auth";
import {
  json,
  checkOrigin,
  readBody,
  errorResponse,
  rateLimit,
} from "@/server/http";
import * as images from "@/server/images";
import * as receipts from "@/server/receipts";
import { AppError } from "@/domain/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const version = z
  .object({ schemaVersion: z.literal(1), expectedVersion: z.int().min(1) })
  .strict();
async function handle(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await params;
    const owner = await ownerFor(request);
    const method = request.method;
    if (method !== "GET") {
      checkOrigin(request);
      rateLimit(owner, "mutation");
    }
    if (path[0] === "deletions" && path.length === 2 && method === "GET")
      return json(await images.cleanupDeletion(owner, z.uuid().parse(path[1])));
    if (path[0] === "household" && path.length === 1 && method === "GET")
      return json(await receipts.household(owner));
    if (path[0] === "participants" && path.length <= 2) {
      const body = z
        .object({
          schemaVersion: z.literal(1),
          expectedHouseholdVersion: z.int().min(1),
          displayName: z.string().trim().min(1).max(80).optional(),
          archived: z.boolean().optional(),
        })
        .strict()
        .refine(
          (b) => b.displayName !== undefined || b.archived !== undefined,
          "Provide a name or archived state",
        )
        .parse(await readBody(request));
      if (method === "POST" && path.length === 1 && body.displayName)
        return json(await receipts.participant(owner, body), 201);
      if (method === "PATCH" && path.length === 2)
        return json(
          await receipts.participant(owner, body, z.uuid().parse(path[1])),
        );
    }
    if (path[0] === "receipts" && path.length === 1) {
      if (method === "POST") {
        const b = z
          .object({
            schemaVersion: z.literal(1),
            merchant: z.string().max(160).nullable().optional(),
            purchasedOn: z.iso.date().nullable().optional(),
          })
          .strict()
          .parse(await readBody(request));
        return json(
          await receipts.createReceipt(owner, b.merchant, b.purchasedOn),
          201,
        );
      }
      if (method === "GET") {
        const u = new URL(request.url);
        const opts = z
          .object({
            cursor: z.string().max(1000).optional(),
            from: z.iso.date().optional(),
            to: z.iso.date().optional(),
            limit: z.coerce.number().int().min(1).max(50).default(20),
          })
          .parse(Object.fromEntries(u.searchParams));
        return json(await receipts.history(owner, opts));
      }
    }
    if (path[0] === "receipts" && path.length >= 2) {
      const id = z.uuid().parse(path[1]);
      const action = path[2];
      if (path.length === 2 && method === "DELETE") {
        const b = version.parse(await readBody(request));
        return json(
          await images.deleteReceipt(owner, id, b.expectedVersion),
          202,
        );
      }
      if (path.length === 3 && action === "image" && method === "GET") {
        const variant = z
          .enum(["display", "original"])
          .parse(new URL(request.url).searchParams.get("variant") ?? "display");
        return await images.imageResponse(owner, id, variant);
      }
      if (path.length === 3 && action === "image" && method === "POST") {
        rateLimit(owner, "upload", 10);
        const form = await images.boundedMultipart(request);
        const b = version.parse({
          schemaVersion: Number(form.get("schemaVersion")),
          expectedVersion: Number(form.get("expectedVersion")),
        });
        const blob = form.get("file");
        if (!(blob instanceof File))
          throw new AppError("MALFORMED_REQUEST", 400);
        return json(
          await images.upload(
            owner,
            id,
            b.expectedVersion,
            blob,
            request.signal,
          ),
          201,
        );
      }
      if (path.length === 3 && action === "process" && method === "POST") {
        rateLimit(owner, "ocr", 5);
        const b = version.parse(await readBody(request));
        return json(
          await images.processReceipt(
            owner,
            id,
            b.expectedVersion,
            request.signal,
          ),
        );
      }
      if (path.length === 2 && method === "GET")
        return json(await receipts.getReceipt(owner, id));
      if (path.length === 3 && action === "draft" && method === "PUT")
        return json(
          await receipts.saveDraft(owner, id, await readBody(request)),
        );
      if (
        path.length === 3 &&
        method === "POST" &&
        (action === "preview" || action === "finalize")
      ) {
        const b = version.parse(await readBody(request));
        if (action === "preview")
          return json(await receipts.preview(owner, id, b.expectedVersion));
        const result = await receipts.finalize(owner, id, b.expectedVersion);
        return json(result.receipt, result.created ? 201 : 200);
      }
    }
    throw new AppError("NOT_FOUND", 404);
  } catch (e) {
    return errorResponse(e);
  }
}
export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
};
