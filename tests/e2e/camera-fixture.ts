import type { Page } from "@playwright/test";
// Isolate synthetic camera bytes per test while keeping repeated captures within one test identical.
// Pixel content still comes from the fake video device and is read by real native OCR.
export async function uniqueCameraFixture(page: Page) {
  await page.addInitScript(() => {
    const nonce = crypto.randomUUID(),
      original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      original.call(
        this,
        (blob) =>
          callback(blob ? new Blob([blob, nonce], { type: blob.type }) : null),
        type,
        quality,
      );
    };
  });
}
