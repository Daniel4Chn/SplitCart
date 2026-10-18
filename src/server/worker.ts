import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { workerErrorSchema } from "@/domain/ocr-contract";
import { AppError } from "@/domain/errors";
// M3 IMG-06: detached process group; fixed environment, bounded output and lifetime.
export function supervise(
  executable: string,
  args: string[],
  options: {
    timeout?: number;
    limit?: number;
    signal?: AbortSignal;
    expectedAttemptId?: string;
  } = {},
): Promise<unknown> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        NODE_ENV: process.env.NODE_ENV,
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        LANG: "C.UTF-8",
        PYTHONPATH: resolve("python"),
        OMP_THREAD_LIMIT: "1",
        OPENBLAS_NUM_THREADS: "1",
        MKL_NUM_THREADS: "1",
        VECLIB_MAXIMUM_THREADS: "1",
      },
    });
    let stdout = Buffer.alloc(0),
      errSize = 0,
      problem: AppError | null = null,
      settled = false;
    function kill() {
      if (child.pid)
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          /* already gone */
        }
    }
    function fail(code: string, status: number) {
      if (!problem)
        problem = new AppError(
          code,
          status,
          "Processing failed. Retry or enter the receipt manually.",
        );
      kill();
    }
    const timer = setTimeout(
      () => fail("OCR_TIMEOUT", 504),
      options.timeout ?? 60000,
    );
    const aborted = () => fail("OCR_FAILED", 502);
    options.signal?.addEventListener("abort", aborted, { once: true });
    if (options.signal?.aborted) aborted();
    function done(error: unknown, value?: unknown) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", aborted);
      kill();
      if (error) reject(error);
      else resolveResult(value);
    }
    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length + chunk.length > (options.limit ?? 4 * 1024 * 1024))
        fail("OCR_FAILED", 502);
      else stdout = Buffer.concat([stdout, chunk]);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      errSize += chunk.length;
      if (errSize > 65536) fail("OCR_FAILED", 502);
    });
    child.on("error", () =>
      done(
        new AppError(
          "OCR_UNAVAILABLE",
          503,
          "Processing engine is unavailable. Manual entry is still available.",
        ),
      ),
    );
    child.on("close", (code) => {
      if (problem) return done(problem);
      let result: unknown;
      try {
        result = JSON.parse(stdout.toString("utf8"));
      } catch {
        return done(new AppError("OCR_FAILED", 502));
      }
      if (code !== 0) {
        const parsed = workerErrorSchema.safeParse(result);
        if (
          code !== 2 ||
          !parsed.success ||
          (options.expectedAttemptId &&
            parsed.data.attemptId !== options.expectedAttemptId)
        )
          return done(new AppError("OCR_FAILED", 502));
        return done(
          new AppError(
            parsed.data.error.code,
            parsed.data.error.code === "IMAGE_UNREADABLE" ? 422 : 502,
            "Processing failed. Retry or enter manually.",
          ),
        );
      }
      done(null, result);
    });
  });
}
export function worker(
  input: string,
  request: string,
  signal?: AbortSignal,
  expectedAttemptId?: string,
) {
  return supervise(
    resolve(process.env.SPLITCART_PYTHON || ".venv/bin/python"),
    ["-m", "splitcart.cli", "--input", input, "--request", request],
    { signal, expectedAttemptId },
  );
}
