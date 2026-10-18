import { describe, it, expect } from "vitest";
import {
  checkOrigin,
  readBody,
  errorResponse,
  rateLimit,
} from "../../src/server/http";
import { draftSchema } from "../../src/domain/contracts";
import { ocrSchema, validatedSchema } from "../../src/domain/ocr-contract";
describe("M0/M2/M6 A-FOUND-1 A-API-1 A-SEC-1 contracts and request guards", () => {
  it("rejects malformed money, graph and Python schema without leaking data", () => {
    const result = draftSchema.safeParse({
      schemaVersion: 1,
      reviewedTotalCents: 1.01,
    });
    expect(result.success).toBe(false);
    expect(() => ocrSchema.parse({ schemaVersion: 2 })).toThrow();
    expect(() =>
      validatedSchema.parse({
        schemaVersion: 1,
        attemptId: "bad",
        status: "validated",
      }),
    ).toThrow();
    const response = errorResponse(Error("secret receipt text"));
    expect(response.status).toBe(500);
  });
  it("requires exact configured mutation origin", () => {
    const url = process.env.NEXTAUTH_URL || "http://localhost:3000";
    expect(() => checkOrigin(new Request(url))).toThrow();
    expect(() =>
      checkOrigin(
        new Request(url, { headers: { origin: "https://attacker.invalid" } }),
      ),
    ).toThrow();
    expect(() =>
      checkOrigin(
        new Request(url, { headers: { origin: new URL(url).origin } }),
      ),
    ).not.toThrow();
  });
  it("bounds JSON bodies and handles malformed JSON", async () => {
    await expect(
      readBody(
        new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: '{"text":"too large"}',
        }),
        5,
      ),
    ).rejects.toMatchObject({ code: "UPLOAD_TOO_LARGE" });
    await expect(
      readBody(
        new Request("http://localhost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "bad",
        }),
      ),
    ).rejects.toMatchObject({ code: "MALFORMED_REQUEST" });
  });
  it("bounds mutation bursts", () => {
    rateLimit("test-http", "mutation", 1);
    expect(() => rateLimit("test-http", "mutation", 1)).toThrow();
  });
});
