// M2/M5 A-UX-3 A-DB-3: real app process restart, persisted exact summary.
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
const origin = "http://127.0.0.1:3102";
let child: ChildProcess | undefined, id: string | undefined;
async function start() {
  child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3102",
    ],
    {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        NODE_ENV: "development",
        SPLITCART_DEV_AUTH: "1",
        NEXTAUTH_URL: origin,
      },
    },
  );
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw Error("App exited during restart check");
    try {
      if ((await fetch(origin + "/api/health")).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw Error("App startup timeout");
}
async function stop() {
  if (!child?.pid) return;
  const running = child;
  await new Promise<void>((done) => {
    const timeout = setTimeout(() => {
      try {
        process.kill(-running.pid!, "SIGKILL");
      } catch {}
      done();
    }, 5000);
    running.once("close", () => {
      clearTimeout(timeout);
      done();
    });
    try {
      process.kill(-running.pid!, "SIGTERM");
    } catch {
      clearTimeout(timeout);
      done();
    }
  });
  child = undefined;
}
async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch(origin + "/api/v1/" + path, {
    method,
    headers: { origin, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await r.json();
  if (!r.ok) throw Error(result.error.code);
  return result.data;
}
try {
  await start();
  const h = await api("household");
  const p = h.participants.find((p: { archived: boolean }) => !p.archived);
  if (!p) throw Error("No active local test participant");
  const created = await api("receipts", "POST", {
    schemaVersion: 1,
    merchant: "Synthetic restart check",
  });
  id = created.id;
  const item = randomUUID();
  const saved = await api("receipts/" + id + "/draft", "PUT", {
    ...created.draft,
    payerParticipantId: p.id,
    reviewedTotalCents: "891",
    items: [
      {
        id: item,
        description: "Synthetic groceries",
        quantity: null,
        unitPriceCents: null,
        grossCents: "891",
        sourceLineIds: [],
      },
    ],
    assignments: [{ itemId: item, participantId: p.id, weight: 1 }],
    review: { confirmed: true, sourceAttemptId: null, lineResolutions: [] },
  });
  const final = await api("receipts/" + id + "/finalize", "POST", {
    schemaVersion: 1,
    expectedVersion: saved.version,
  });
  await stop();
  await start();
  const reopened = await api("receipts/" + id);
  if (
    reopened.finalization.id !== final.finalization.id ||
    reopened.finalization.totalCents !== "891"
  )
    throw Error("Restart changed saved summary");
  await api("receipts/" + id, "DELETE", {
    schemaVersion: 1,
    expectedVersion: reopened.version,
  });
  id = undefined;
  console.log(
    "App stop/start preserves immutable $8.91 summary and finalization ID.",
  );
} finally {
  if (id && child)
    try {
      const r = await api("receipts/" + id);
      await api("receipts/" + id, "DELETE", {
        schemaVersion: 1,
        expectedVersion: r.version,
      });
    } catch {}
  await stop();
}
