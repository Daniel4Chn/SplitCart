import { describe, it, expect } from "vitest";
import { supervise } from "../../src/server/worker";
describe("M3 IMG-06 A-IMG-3 supervised worker faults", () => {
  it("handles missing executable, malformed JSON, overflow, nonzero and hangs", async () => {
    await expect(
      supervise("/splitcart-missing-executable", []),
    ).rejects.toMatchObject({ code: "OCR_UNAVAILABLE" });
    await expect(
      supervise(process.execPath, ["-e", 'process.stdout.write("bad")']),
    ).rejects.toMatchObject({ code: "OCR_FAILED" });
    await expect(
      supervise(
        process.execPath,
        ["-e", 'process.stdout.write("x".repeat(10000))'],
        { limit: 100 },
      ),
    ).rejects.toMatchObject({ code: "OCR_FAILED" });
    await expect(
      supervise(process.execPath, ["-e", 'console.log("{}");process.exit(1)']),
    ).rejects.toMatchObject({ code: "OCR_FAILED" });
    await expect(
      supervise(process.execPath, ["-e", "setInterval(()=>{},100)"], {
        timeout: 100,
      }),
    ).rejects.toMatchObject({ code: "OCR_TIMEOUT" });
  });
  it("kills descendants on deadline", async () => {
    const { mkdtemp, readFile, rm } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const dir = await mkdtemp(resolve(".data/worker-test-"));
    const pidFile = resolve(dir, "pid");
    try {
      await expect(
        supervise(
          process.execPath,
          [
            "-e",
            `const c=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},100)']);require('node:fs').writeFileSync(process.argv[1],String(c.pid));setInterval(()=>{},100)`,
            pidFile,
          ],
          { timeout: 500 },
        ),
      ).rejects.toMatchObject({ code: "OCR_TIMEOUT" });
      const pid = Number(await readFile(pidFile, "utf8"));
      await new Promise((r) => setTimeout(r, 100));
      expect(() => process.kill(pid, 0)).toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

it("M3 A-IMG-3 validates expected failure schema and attempt identity", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const payload = {
    schemaVersion: 1,
    attemptId: id,
    status: "error",
    error: { code: "OCR_FAILED", message: "safe" },
    warnings: [],
  };
  await expect(
    supervise(
      process.execPath,
      [
        "-e",
        "console.log(process.argv[1]);process.exit(2)",
        JSON.stringify(payload),
      ],
      { expectedAttemptId: id },
    ),
  ).rejects.toMatchObject({ code: "OCR_FAILED", status: 502 });
  await expect(
    supervise(
      process.execPath,
      [
        "-e",
        "console.log(process.argv[1]);process.exit(2)",
        JSON.stringify({
          ...payload,
          error: { code: "IMAGE_UNREADABLE", message: "safe" },
        }),
      ],
      { expectedAttemptId: id },
    ),
  ).rejects.toMatchObject({ code: "IMAGE_UNREADABLE", status: 422 });
  await expect(
    supervise(
      process.execPath,
      [
        "-e",
        "console.log(process.argv[1]);process.exit(2)",
        JSON.stringify(payload),
      ],
      { expectedAttemptId: "00000000-0000-4000-8000-000000000002" },
    ),
  ).rejects.toMatchObject({ code: "OCR_FAILED", status: 502 });
});
