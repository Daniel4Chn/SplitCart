import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { execFileSync } from "node:child_process";
const { pool } = await import("../src/server/db");
try {
  await pool.query("SELECT 1");
  console.log("PostgreSQL: connected");
  console.log(
    execFileSync(
      process.env.SPLITCART_PYTHON || ".venv/bin/python",
      [
        "-c",
        "import cv2, PIL; print('OpenCV',cv2.__version__,'Pillow',PIL.__version__)",
      ],
      { encoding: "utf8", timeout: 15000 },
    ).trim(),
  );
  console.log(
    execFileSync("tesseract", ["--version"], {
      encoding: "utf8",
      timeout: 15000,
    }).split("\n")[0],
  );
} finally {
  await pool.end();
}
