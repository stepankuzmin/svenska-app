import { expect, test } from "@playwright/test";

const dictionary = {
  metadata: {
    sourceEditionDate: "2010-07-07",
    attribution: "Lexin",
    license: "CC BY 4.0",
  },
  entries: {
    fika: [{ partOfSpeech: "substantiv", meaning: "", translation: "перерыв на кофе" }],
    tack: [{ partOfSpeech: "interjektion", meaning: "", translation: "спасибо" }],
  },
  russianIndex: {
    "перерыв на кофе": ["fika"],
    "спасибо": ["tack"],
  },
};

test.beforeEach(async ({ page }) => {
  await page.route("**/lexin-dictionary.*.json", (route) =>
    route.fulfill({ contentType: "application/json", json: dictionary }),
  );
});

test("opened lookups persist in most-recent order and can be reopened or removed", async ({ page }) => {
  await page.goto("/");

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("fika");
  await query.press("Enter");
  await expect(page.getByRole("heading", { name: "fika" })).toBeVisible();

  await query.fill("спасибо");
  await query.press("Enter");
  await expect(page.getByRole("heading", { name: "tack" })).toBeVisible();

  await query.fill("fika");
  await query.press("Enter");

  const library = page.getByRole("region", { name: "Lookup library" });
  await expect(library.getByRole("button", { name: "Open fika, перерыв на кофе" })).toBeVisible();
  await expect(library.getByRole("button", { name: "Open tack, спасибо" })).toBeVisible();
  await expect(library.getByRole("listitem")).toHaveText([/fika/, /tack/]);

  await page.reload();
  await expect(library.getByRole("listitem")).toHaveText([/fika/, /tack/]);

  await library.getByRole("button", { name: "Open tack, спасибо" }).click();
  await expect(page.getByRole("heading", { name: "tack" })).toBeVisible();
  await expect(library.getByRole("listitem")).toHaveText([/tack/, /fika/]);

  await library.getByRole("button", { name: "Remove fika from library" }).click();
  await expect(library.getByRole("button", { name: "Open fika, перерыв на кофе" })).toHaveCount(0);
});

test("the header link reaches the library and clearing requires confirmation", async ({ page }) => {
  await page.goto("/");

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("fika");
  await query.press("Enter");

  await page.getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL(/#lookup-library$/);
  await expect(page.getByRole("region", { name: "Lookup library" })).toBeInViewport();

  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Clear library" }).click();
  await expect(page.getByText("Opened words will appear here.")).toBeVisible();
});
