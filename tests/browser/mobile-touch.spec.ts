import { expect, test } from "@playwright/test";

const fikaNoun = /^fika substantiv/;

const dictionary = {
  metadata: { sourceEditionDate: "2010-07-07", attribution: "Lexin", license: "CC BY 4.0" },
  entries: {
    fika: [{ word: "101", partOfSpeech: "substantiv", meaning: "", translation: "перерыв на кофе" }],
    fikapaus: [{ word: "102", partOfSpeech: "substantiv", meaning: "", translation: "перерыв на кофе" }],
  },
  swedishIndex: { fika: ["101"], fikapaus: ["102"] },
  russianIndex: { "перерыв на кофе": ["101", "102"] },
};

test("a tap opens a suggested word without the field grabbing focus first", async ({ page }) => {
  await page.route("**/lexin-dictionary.*.json", (route) =>
    route.fulfill({ contentType: "application/json", json: dictionary }),
  );
  await page.goto(".");

  // A coarse pointer cannot raise a keyboard, so the caret waits for a tap.
  const query = page.getByLabel("Swedish or Russian word");
  await expect(query).toBeVisible();
  await expect(query).not.toBeFocused();

  await query.fill("fik");
  await page.getByRole("option", { name: fikaNoun }).tap();

  await expect(query).toHaveValue("");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Library" })).toBeVisible();
  await expect(page.locator(".word-card[open] summary strong")).toHaveText("fika");
});
