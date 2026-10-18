import { test, expect } from "@playwright/test";
test("M2/M5 P-03,04 household manual entry only needs item, cost and sharing choices", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /No receipt\? Add items manually/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "A few items. A fair split." }),
  ).toBeVisible();
  await expect(page.getByLabel("Receipt total", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Household items", exact: true })
    .click();
  await page.getByRole("button", { name: "See the split" }).click();
  await expect(page.locator(".error-banner")).toContainText(
    "item name and cost",
  );
  const roommate = "Alex " + Date.now().toString().slice(-6);
  await page.getByLabel("Roommate name").fill(roommate);
  await page.getByRole("button", { name: "Add roommate", exact: true }).click();
  await expect(
    page.getByRole("button", { name: new RegExp(roommate) }),
  ).toBeVisible();
  await page.getByLabel("Item 1", { exact: true }).fill("Paper towels");
  await page.getByLabel("Cost for item 1", { exact: true }).fill("8.91");
  await page.getByLabel("Cost for item 1", { exact: true }).press("Tab");
  await page.getByRole("button", { name: new RegExp(roommate) }).click();
  await page.screenshot({
    path: ".data/screenshots/manual-mobile.png",
    fullPage: true,
  });
  await expect(page.getByLabel("Paid by")).toHaveValue("");
  await page.getByLabel("Paid by").selectOption({ label: "You" });
  await page.getByRole("button", { name: "See the split" }).click();
  await expect(page.locator(".done-total")).toContainText("$8.91");
  await expect(page.locator(".share-list>div")).toHaveCount(2);
  await page.getByRole("button", { name: "Confirm & save split" }).click();
  await expect(page.getByText("SAVED & SORTED")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Past splits", exact: true }).click();
  await page
    .getByRole("button", { name: /Household items/ })
    .first()
    .click();
  await expect(page.locator(".done-total")).toContainText("$8.91");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Delete receipt", exact: true })
    .click();
  const h = (await (await request.get("/api/v1/household")).json()).data;
  const p = h.participants.find(
    (p: { displayName: string }) => p.displayName === roommate,
  );
  await request.patch("/api/v1/participants/" + p.id, {
    headers: { origin: "http://127.0.0.1:3000" },
    data: {
      schemaVersion: 1,
      expectedHouseholdVersion: h.version,
      archived: true,
    },
  });
});
