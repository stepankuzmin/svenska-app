import { expect, test, type Page } from "@playwright/test";

async function searchFor(page: Page, query: string) {
  const field = page.getByLabel("Swedish or Russian word");
  await field.fill(query);
  await field.press("Enter");
}

test("lookup remains available after an online visit and offline reload", async ({ context, page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Look up" })).toBeEnabled();

  await page.waitForFunction("navigator.serviceWorker?.controller !== null");

  await context.setOffline(true);
  await page.evaluate("location.reload()");
  await expect(page.getByRole("button", { name: "Look up" })).toBeEnabled();

  await searchFor(page, "bok");
  await expect(page.getByRole("heading", { name: "bok" })).toBeVisible();

  await searchFor(page, "bokst");
  await expect(page.getByRole("heading", { name: "Choose a word" })).toBeVisible();

  await searchFor(page, "definitely-not-a-swedish-word");
  await expect(page.getByRole("heading", { name: "No matching word" })).toBeVisible();
});

test("a first offline visit explains that one connection is required", async ({ context, page }) => {
  await page.route("**/lexin-dictionary.*.json", async (route) => {
    await context.setOffline(true);
    await route.abort("internetdisconnected");
  });

  await page.goto("/");

  await expect(page.getByText(/connect once/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Look up" })).toBeDisabled();
});
