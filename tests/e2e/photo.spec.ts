import { uniqueCameraFixture } from "./camera-fixture";
import { test, expect } from "@playwright/test";
test("M5 P-01..06 A-UX-1 camera capture automatically reads receipt and opens simple review", async ({
  page,
  request,
}) => {
  const list = (await (await request.get("/api/v1/receipts")).json()).data;
  for (const entry of list.receipts.filter(
    (r: { merchant: string }) => r.merchant === "Synthetic camera test",
  )) {
    const r = (await (await request.get("/api/v1/receipts/" + entry.id)).json())
      .data;
    await request.delete("/api/v1/receipts/" + r.id, {
      headers: { origin: "http://127.0.0.1:3000" },
      data: { schemaVersion: 1, expectedVersion: r.version },
    });
  }
  await uniqueCameraFixture(page);
  await page.goto("/");
  await expect(page.locator("input[type=file]")).toHaveCount(0);
  await page.screenshot({
    path: ".data/screenshots/home-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Take a receipt photo", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Take photo", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Take photo", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A quick check. Then split." }),
  ).toBeVisible({ timeout: 65000 });
  await expect(page.getByLabel("Item 1", { exact: true })).toHaveValue("MILK");
  await expect(page.getByLabel("Receipt total", { exact: true })).toHaveValue(
    "6.00",
  );
  await expect(
    page.getByRole("button", { name: "Import suggestions for review" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Scan warnings" }),
  ).toContainText("eligible items are unknown");
  await page.getByText("View receipt photo", { exact: true }).click();
  await expect(page.locator(".mobile-photo img")).toBeVisible();
  await page.getByRole("button", { name: "Zoom receipt in" }).click();
  await expect(page.locator(".mobile-photo img")).toHaveAttribute(
    "style",
    /150%/,
  );
  const taxAmount = page.locator('input[aria-label^="Amount for"]').first();
  await taxAmount.fill("");
  await taxAmount.press("Tab");
  await expect(
    page.getByRole("region", { name: "Receipt reconciliation" }),
  ).toContainText("Missing tax / fee amount");
  await expect(page.getByTestId("receipt-difference")).toHaveText(
    "Needs amounts",
  );
  await taxAmount.fill("0.51");
  await taxAmount.press("Tab");
  await page.getByLabel("Store", { exact: true }).fill("Synthetic camera test");
  await page.getByLabel("Price for item 1", { exact: true }).fill("9.99");
  await page.getByLabel("Price for item 1", { exact: true }).press("Tab");
  await expect(page.getByTestId("receipt-difference")).toHaveText("+$6.50");
  await page.getByLabel("Price for item 1", { exact: true }).fill("3.49");
  await page.getByLabel("Price for item 1", { exact: true }).press("Tab");
  await page
    .getByRole("checkbox", {
      name: "I checked the items, charges and total against my receipt.",
    })
    .check();
  await expect(
    page.getByRole("checkbox", { name: /I checked which items/ }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Looks good. Pick people" }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: /I checked which items/ }).check();
  await page
    .getByRole("checkbox", {
      name: "I checked the items, charges and total against my receipt.",
    })
    .check();
  await page.screenshot({
    path: ".data/screenshots/review-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Looks good. Pick people" }).click();
  await expect(page.getByLabel("Paid by")).toHaveValue("");
  await page.getByLabel("Paid by").selectOption({ label: "You" });
  await page.getByRole("button", { name: "See the split" }).click();
  await expect(page.locator(".done-total")).toContainText("$6.00");
  await page.getByRole("button", { name: "Confirm & save split" }).click();
  await expect(page.getByText("SAVED & SORTED")).toBeVisible();
  await page.screenshot({
    path: ".data/screenshots/camera-summary.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Scan another receipt", exact: true })
    .click();
  await page.getByRole("button", { name: "Take photo", exact: true }).click();
  await expect(page.getByText("SAVED & SORTED")).toBeVisible({
    timeout: 65000,
  });
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Delete receipt", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /A shared home/ }),
  ).toBeVisible();
});
test("M5 P-10 camera permission failure is actionable", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Take a receipt photo", exact: true })
    .click();
  await expect(page.locator(".error-banner")).toContainText(
    "Allow camera access",
  );
  await expect(
    page.getByRole("button", { name: "Try camera again" }),
  ).toBeVisible();
});
test("M5 P-10 desktop landing layout", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.screenshot({
    path: ".data/screenshots/home-desktop.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("M5 P-01 camera cancellation stops the video track", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Take a receipt photo", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Take photo", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const media = document.querySelector("video")!.srcObject as MediaStream;
    (window as unknown as { captureTrack: MediaStreamTrack }).captureTrack =
      media.getVideoTracks()[0];
  });
  await page.getByRole("button", { name: "Close camera" }).click();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { captureTrack: MediaStreamTrack }).captureTrack
          .readyState,
    ),
  ).toBe("ended");
});
