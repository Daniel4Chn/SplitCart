import { uniqueCameraFixture } from "./camera-fixture";
import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
const origin = "http://127.0.0.1:3000";
async function manual(page: Page) {
  await page.goto("/");
  const created = page.waitForResponse(
    (r) =>
      r.url() === origin + "/api/v1/receipts" &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: /No receipt\? Add items manually/ })
    .click();
  return (await (await created).json()).data.id as string;
}
async function cleanup(request: APIRequestContext, id: string) {
  const r = await request.get("/api/v1/receipts/" + id);
  if (r.ok()) {
    const d = (await r.json()).data;
    await request.delete("/api/v1/receipts/" + id, {
      headers: { origin },
      data: { schemaVersion: 1, expectedVersion: d.version },
    });
  }
}
test("M5 A-UX-2 edits save on navigation; saves disable editing and drafts can be deleted", async ({
  page,
  request,
}) => {
  const id = await manual(page);
  try {
    await page
      .getByLabel("Item 1", { exact: true })
      .fill("Navigation-safe towels");
    await page.getByLabel("Cost for item 1", { exact: true }).fill("1.23");
    await page.getByLabel("Cost for item 1", { exact: true }).press("Tab");
    await page.route("**/api/v1/receipts/*/draft", async (route) => {
      await new Promise((r) => setTimeout(r, 400));
      await route.continue();
    });
    await page
      .getByRole("button", { name: "Past splits", exact: true })
      .click();
    await expect(page.getByLabel("Item 1", { exact: true })).toBeDisabled();
    await expect(
      page.getByRole("heading", { name: "Past splits." }),
    ).toBeVisible();
    const stored = (await (await request.get("/api/v1/receipts/" + id)).json())
      .data;
    expect(stored.draft.items[0].description).toBe("Navigation-safe towels");
    expect(stored.draft.items[0].grossCents).toBe("123");
    await page
      .getByRole("button", { name: /Household items/ })
      .first()
      .click();
    await expect(page.getByLabel("Item 1", { exact: true })).toHaveValue(
      "Navigation-safe towels",
    );
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Delete draft", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: /A shared home/ }),
    ).toBeVisible();
    expect((await request.get("/api/v1/receipts/" + id)).status()).toBe(404);
  } finally {
    await cleanup(request, id);
  }
});
test("M5 A-UX-2 failed saves retain edits and block navigation", async ({
  page,
  request,
}) => {
  const id = await manual(page);
  try {
    await page.getByLabel("Item 1", { exact: true }).fill("Keep this edit");
    await page.route("**/api/v1/receipts/*/draft", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          schemaVersion: 1,
          error: {
            code: "OFFLINE",
            message: "Connection unavailable. Try again.",
          },
        }),
      }),
    );
    await page
      .getByRole("button", { name: "Past splits", exact: true })
      .click();
    await expect(page.locator(".error-banner")).toContainText(
      "Connection unavailable",
    );
    await expect(page.getByLabel("Item 1", { exact: true })).toHaveValue(
      "Keep this edit",
    );
    await expect(
      page.getByRole("heading", { name: "A few items. A fair split." }),
    ).toBeVisible();
    await page.unroute("**/api/v1/receipts/*/draft");
  } finally {
    await cleanup(request, id);
  }
});
test("M5 A-UX-3 history loads beyond 20 and applies date filters", async ({
  page,
}) => {
  const uuid = (i: number) =>
    "00000000-0000-4000-8000-" + String(i).padStart(12, "0");
  await page.route(/\/api\/v1\/receipts(?:\?.*)?$/, async (route) => {
    const u = new URL(route.request().url()),
      last = !!u.searchParams.get("cursor");
    await route.fulfill({
      json: {
        schemaVersion: 1,
        data: {
          receipts: u.searchParams.get("from")
            ? []
            : last
              ? [
                  {
                    id: uuid(21),
                    merchant: "Older household receipt",
                    status: "draft",
                    date: "2026-01-01",
                    dateSource: "receipt",
                    finalization: null,
                  },
                ]
              : Array.from({ length: 20 }, (_, i) => ({
                  id: uuid(i + 1),
                  merchant: "Page one " + i,
                  status: "draft",
                  date: "2026-10-17",
                  dateSource: "created",
                  finalization: null,
                })),
          nextCursor:
            last || u.searchParams.get("from") ? null : "synthetic-second-page",
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Past splits", exact: true }).click();
  await expect(page.locator(".history-entry")).toHaveCount(20);
  await page.getByText("Filter by date", { exact: true }).click();
  await page.getByLabel("From date").fill("2026-01-01");
  await page.getByLabel("To date").fill("2026-12-31");
  const nextRequest = page.waitForRequest((r) =>
    r.url().includes("cursor=synthetic-second-page"),
  );
  await page.getByRole("button", { name: "Load more receipts" }).click();
  expect(
    new URL((await nextRequest).url()).searchParams.get("from"),
  ).toBeNull();
  await expect(page.locator(".history-entry")).toHaveCount(21);
  await expect(
    page.getByRole("button", { name: /Older household receipt/ }),
  ).toContainText("2026-01-01");
  await page.getByLabel("From date").fill("2026-01-01");
  await page.getByLabel("To date").fill("2026-12-31");
  const filtered = page.waitForRequest(
    (r) =>
      r.url().includes("from=2026-01-01") && r.url().includes("to=2026-12-31"),
  );
  await page.getByRole("button", { name: "Apply dates" }).click();
  await filtered;
  await expect(page.locator(".history-entry")).toHaveCount(0);
});
test("M5/M6 P-08 account identity, roommate rename/archive/restore and focus", async ({
  page,
  request,
}) => {
  let h = (await (await request.get("/api/v1/household")).json()).data;
  const name = "Zed " + Date.now();
  h = (
    await (
      await request.post("/api/v1/participants", {
        headers: { origin },
        data: {
          schemaVersion: 1,
          expectedHouseholdVersion: h.version,
          displayName: name,
        },
      })
    ).json()
  ).data;
  const person = h.participants.find(
    (p: { displayName: string }) => p.displayName === name,
  );
  try {
    await page.goto("/");
    await page.getByRole("button", { name: /My account/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Local preview");
    await page.screenshot({
      path: ".data/screenshots/account-mobile.png",
      fullPage: true,
    });
    page.once("dialog", (d) => d.accept(name + " renamed"));
    await dialog
      .getByRole("button", { name: "Rename " + name, exact: true })
      .click();
    await expect(
      dialog.getByRole("button", {
        name: "Rename " + name + " renamed",
        exact: true,
      }),
    ).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await dialog
      .getByRole("button", {
        name: "Archive " + name + " renamed",
        exact: true,
      })
      .click();
    await dialog.getByText(/^Archived people/).click();
    await expect(
      dialog.getByRole("button", {
        name: "Restore " + name + " renamed",
        exact: true,
      }),
    ).toBeVisible();
    await dialog
      .getByRole("button", {
        name: "Restore " + name + " renamed",
        exact: true,
      })
      .click();
    await expect(
      dialog.getByRole("button", {
        name: "Archive " + name + " renamed",
        exact: true,
      }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: /My account/ }),
    ).toBeFocused();
  } finally {
    h = (await (await request.get("/api/v1/household")).json()).data;
    await request.patch("/api/v1/participants/" + person.id, {
      headers: { origin },
      data: {
        schemaVersion: 1,
        expectedHouseholdVersion: h.version,
        archived: true,
      },
    });
  }
});
test("M6 P-08 hosted account exposes identity and library sign-out", async ({
  page,
}) => {
  await page.route("**/api/v1/household", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.account = {
      displayName: "Synthetic hosted organizer",
      mode: "google",
    };
    await route.fulfill({ response, json: body });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /My account/ }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Synthetic hosted organizer",
  );
  await expect(
    page.getByRole("link", { name: "Sign out", exact: true }),
  ).toHaveAttribute("href", "/api/auth/signout");
});
async function cameraCapture(page: Page) {
  await uniqueCameraFixture(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Take a receipt photo", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Take photo", exact: true }),
  ).toBeVisible();
  const created = page.waitForResponse(
    (r) =>
      r.url() === origin + "/api/v1/receipts" &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Take photo", exact: true }).click();
  return (await (await created).json()).data.id as string;
}
test("M3/M5 A-IMG-3 temporary OCR busy can retry the saved photo", async ({
  page,
  request,
}) => {
  let first = true;
  await page.route("**/api/v1/receipts/*/process", async (route) => {
    if (first) {
      first = false;
      await route.fulfill({
        status: 429,
        json: {
          schemaVersion: 1,
          error: {
            code: "OCR_BUSY",
            message: "Reading is busy. Retry shortly.",
          },
        },
      });
    } else await route.continue();
  });
  const id = await cameraCapture(page);
  try {
    await expect(page.locator(".error-banner")).toContainText(
      "Reading is busy",
    );
    await page
      .locator(".error-banner")
      .getByRole("button", { name: "Retry reading", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "A quick check. Then split." }),
    ).toBeVisible({ timeout: 65000 });
    await expect(page.getByLabel("Item 1", { exact: true })).toHaveValue(
      "MILK",
    );
    await page.getByLabel("Item 1", { exact: true }).fill("Corrected milk");
    await page
      .getByRole("button", { name: "Retry reading", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "A quick check. Then split." }),
    ).toBeVisible({ timeout: 65000 });
    await expect(page.getByLabel("Item 1", { exact: true })).toHaveValue(
      "Corrected milk",
    );
    await expect(
      page.getByRole("button", { name: "Use recovered scan" }),
    ).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Delete draft", exact: true })
      .click();
  } finally {
    await cleanup(request, id);
  }
});
test("M5 A-UX-2 completed OCR recovers after interrupted draft import", async ({
  page,
  request,
}) => {
  let failOnce = true;
  await page.route("**/api/v1/receipts/*/draft", async (route) => {
    if (failOnce) {
      failOnce = false;
      await route.fulfill({
        status: 503,
        json: {
          schemaVersion: 1,
          error: {
            code: "DISCONNECTED",
            message: "Connection dropped before suggestions saved.",
          },
        },
      });
    } else await route.continue();
  });
  const id = await cameraCapture(page);
  try {
    await expect(page.locator(".error-banner")).toContainText(
      "Connection dropped",
    );
    const current = (await (await request.get("/api/v1/receipts/" + id)).json())
      .data;
    expect(current.processing.state).toBe("succeeded");
    expect(current.draft.items).toHaveLength(0);
    await page
      .getByRole("button", { name: "Past splits", exact: true })
      .click();
    await page
      .getByRole("button", { name: /Shared purchase/ })
      .first()
      .click();
    await expect(page.getByLabel("Item 1", { exact: true })).toHaveValue(
      "MILK",
    );
    const recovered = (
      await (await request.get("/api/v1/receipts/" + id)).json()
    ).data;
    expect(recovered.draft.review.confirmed).toBe(false);
    expect(recovered.draft.review.sourceAttemptId).toBe(current.processing.id);
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Delete draft", exact: true })
      .click();
  } finally {
    await cleanup(request, id);
  }
});
test("M5 A-UX-2 reload warns about unsaved edits", async ({
  page,
  request,
}) => {
  const id = await manual(page);
  try {
    await page
      .getByLabel("Item 1", { exact: true })
      .fill("Unsaved reload guard");
    await expect(page.locator(".draft-status")).toContainText("Unsaved");
    let prompted = false;
    page.once("dialog", async (d) => {
      prompted = true;
      expect(d.type()).toBe("beforeunload");
      await d.dismiss();
    });
    await page.reload({ timeout: 1500 }).catch(() => {});
    expect(prompted).toBe(true);
    await expect(page.getByLabel("Item 1", { exact: true })).toHaveValue(
      "Unsaved reload guard",
    );
  } finally {
    await cleanup(request, id);
  }
});
test("M6 P-08 signed-out account never pretends to be signed in", async ({
  page,
}) => {
  await page.route("**/api/v1/household", (route) =>
    route.fulfill({
      status: 401,
      json: {
        schemaVersion: 1,
        error: { code: "UNAUTHENTICATED", message: "Sign in to continue." },
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /My account/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Not signed in");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("link", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("link", { name: "Sign out", exact: true }),
  ).toHaveCount(0);
});
