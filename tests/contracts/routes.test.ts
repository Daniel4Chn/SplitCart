import nextEnv from "@next/env";
const old = process.env.NODE_ENV;
Object.assign(process.env, { NODE_ENV: "development" });
nextEnv.loadEnvConfig(process.cwd(), true);
Object.assign(process.env, { NODE_ENV: old });
import { vi, describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
const identity = vi.hoisted(() => ({ owner: "" }));
vi.mock("../../src/server/auth", async () => {
  const { AppError } = await import("../../src/domain/errors");
  return {
    ownerFor: async () => {
      if (!identity.owner) throw new AppError("UNAUTHENTICATED", 401);
      return identity.owner;
    },
  };
});
const { pool } = await import("../../src/server/db");
const r = await import("../../src/server/receipts");
const { GET, POST, PUT, PATCH, DELETE } = await import(
  "../../src/app/api/v1/[...path]/route"
);
const owners: string[] = [];
const origin = process.env.NEXTAUTH_URL || "http://127.0.0.1:3000";
async function invoke(
  method: string,
  path: string,
  body?: unknown,
  sendOrigin = true,
) {
  const handlers = { GET, POST, PUT, PATCH, DELETE };
  return handlers[method as keyof typeof handlers](
    new Request(origin + "/api/v1/" + path, {
      method,
      headers: {
        ...(sendOrigin ? { origin } : {}),
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
    { params: Promise.resolve({ path: path.split("/") }) },
  );
}
afterAll(async () => {
  for (const o of owners) {
    await pool.query(
      "DELETE FROM receipts WHERE household_id IN (SELECT id FROM households WHERE owner_user_id=$1)",
      [o],
    );
    await pool.query(
      "DELETE FROM participants WHERE household_id IN (SELECT id FROM households WHERE owner_user_id=$1)",
      [o],
    );
    await pool.query("DELETE FROM households WHERE owner_user_id=$1", [o]);
    await pool.query("DELETE FROM storage_deletions WHERE owner_user_id=$1", [
      o,
    ]);
    await pool.query("DELETE FROM users WHERE id=$1", [o]);
  }
  await pool.end();
});
describe("M2/M6 A-API-1..3 A-SEC-1 route authorization and contracts", () => {
  it("requires auth, origin, correct contracts; isolates every receipt action and deletion status", async () => {
    identity.owner = "";
    expect((await invoke("GET", "household")).status).toBe(401);
    const a = await r.ensureOwner("test", randomUUID()),
      b = await r.ensureOwner("test", randomUUID());
    owners.push(a, b);
    identity.owner = a;
    expect(
      (await invoke("POST", "receipts", { schemaVersion: 1 }, false)).status,
    ).toBe(403);
    expect(
      (await invoke("POST", "receipts", { schemaVersion: 2 })).status,
    ).toBe(422);
    const receipt = await r.createReceipt(a);
    identity.owner = b;
    for (const [method, suffix, body] of [
      ["GET", "", undefined],
      ["PUT", "/draft", receipt.draft],
      ["POST", "/preview", { schemaVersion: 1, expectedVersion: 1 }],
      ["POST", "/finalize", { schemaVersion: 1, expectedVersion: 1 }],
      ["GET", "/image", undefined],
      ["POST", "/process", { schemaVersion: 1, expectedVersion: 1 }],
      ["DELETE", "", { schemaVersion: 1, expectedVersion: 1 }],
    ] as const) {
      const response = await invoke(
        method,
        "receipts/" + receipt.id + suffix,
        body,
      );
      expect([404, 422]).toContain(response.status);
      if (response.status === 422)
        expect((await response.json()).error.code).toBe("INVALID_FIELDS");
    }
    const h = await r.household(a),
      hb = await r.household(b);
    expect(
      (
        await invoke("PATCH", "participants/" + h.participants[0].id, {
          schemaVersion: 1,
          expectedHouseholdVersion: hb.version,
          displayName: "Malicious",
        })
      ).status,
    ).toBe(404);
    identity.owner = a;
    const deletion = await invoke("DELETE", "receipts/" + receipt.id, {
      schemaVersion: 1,
      expectedVersion: 1,
    });
    expect(deletion.status).toBe(202);
    const value = await deletion.json();
    identity.owner = b;
    expect(
      (await invoke("GET", "deletions/" + value.data.deletionId)).status,
    ).toBe(404);
  });
});
