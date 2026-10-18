process.env.PLAYWRIGHT_BROWSERS_PATH = ".data/playwright";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
execFileSync(resolve(".venv/bin/python"), ["scripts/camera_fixture.py"]);
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3000",
    permissions: ["camera"],
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--use-file-for-fake-video-capture=" + resolve(".data/camera.y4m"),
      ],
    },
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    timeout: 60000,
  },
});
