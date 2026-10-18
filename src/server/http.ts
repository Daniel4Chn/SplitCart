import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "@/domain/errors";
export function json(data: unknown, status = 200) {
  return Response.json(
    { schemaVersion: 1, data },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
export function checkOrigin(request: Request) {
  const expected = new URL(process.env.NEXTAUTH_URL || request.url).origin;
  if (request.headers.get("origin") !== expected)
    throw new AppError("CSRF_REJECTED", 403, "Refresh the page and try again.");
}
export async function readBody(request: Request, limit = 2 * 1024 * 1024) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError("MALFORMED_REQUEST", 400);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("MALFORMED_REQUEST", 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new AppError("UPLOAD_TOO_LARGE", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError("MALFORMED_REQUEST", 400);
  }
}
export function errorResponse(error: unknown) {
  const requestId = randomUUID();
  if (error instanceof z.ZodError)
    return Response.json(
      {
        schemaVersion: 1,
        error: {
          code: "INVALID_FIELDS",
          message: "Check the highlighted receipt fields.",
          fieldErrors: error.issues.map((i) => ({
            path: i.path.join("."),
            code: i.message,
          })),
          requestId,
        },
      },
      { status: 422, headers: { "Cache-Control": "private, no-store" } },
    );
  if (error instanceof AppError)
    return Response.json(
      {
        schemaVersion: 1,
        error: {
          code: error.code,
          message: error.message,
          fieldErrors: error.fieldErrors,
          requestId,
        },
      },
      {
        status: error.status,
        headers: {
          "Cache-Control": "no-store",
          ...(error.status === 429 ? { "Retry-After": "5" } : {}),
        },
      },
    );
  const code = (error as { code?: string })?.code;
  if (code === "23505")
    return Response.json(
      {
        schemaVersion: 1,
        error: {
          code: "CONFLICT",
          message: "This name or record already exists.",
          fieldErrors: [],
          requestId,
        },
      },
      { status: 409, headers: { "Cache-Control": "private, no-store" } },
    );
  console.error(JSON.stringify({ requestId, code: code ?? "INTERNAL_ERROR" }));
  return Response.json(
    {
      schemaVersion: 1,
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Your saved draft is safe; try again.",
        fieldErrors: [],
        requestId,
      },
    },
    { status: 500, headers: { "Cache-Control": "private, no-store" } },
  );
}
const rates = new Map<string, { start: number; count: number }>();
export function rateLimit(owner: string, action: string, max = 90) {
  const key = owner + ":" + action,
    now = Date.now();
  if (rates.size > 10000)
    for (const [k, v] of rates) if (now - v.start > 60000) rates.delete(k);
  const state = rates.get(key);
  if (!state || now - state.start > 60000) {
    rates.set(key, { start: now, count: 1 });
    return;
  }
  if (++state.count > max)
    throw new AppError("RATE_LIMITED", 429, "Please wait before trying again.");
}
