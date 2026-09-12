import { expect, test, type Page } from "@playwright/test";

async function searchFor(page: Page, query: string) {
  const field = page.getByLabel("Swedish or Russian word");
  await field.fill(query);
  await field.press("Enter");
}

test("lookup remains available after an online visit and offline reload", async ({ context, page }) => {
  await page.goto(".");
  await expect(page.getByRole("status")).toBeEmpty();

  await page.waitForFunction("navigator.serviceWorker?.controller !== null");

  await context.setOffline(true);
  await page.evaluate("location.reload()");
  await expect(page.getByRole("status")).toBeEmpty();

  await searchFor(page, "bok");
  await expect(page.getByRole("region", { name: "Library" }).getByRole("strong").filter({ hasText: /^bok$/ })).toBeVisible();

  const field = page.getByLabel("Swedish or Russian word");
  await field.fill("bokst");
  await expect(page.getByRole("listbox")).toBeVisible();
  await field.fill("definitely-not-a-swedish-word");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("a first offline visit explains that one connection is required", async ({ context, page }) => {
  await page.route("**/lexin-dictionary.*.json", async (route) => {
    await context.setOffline(true);
    await route.abort("internetdisconnected");
  });

  await page.goto(".");

  await expect(page.getByRole("status")).toHaveText(/connect once/i);
  await expect(page.getByLabel("Swedish or Russian word")).toBeFocused();
});
