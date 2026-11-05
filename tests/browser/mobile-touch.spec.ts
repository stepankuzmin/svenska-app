import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const fikaNoun = /^fika substantiv/;

const dictionary = {
  metadata: { sourceEditionDate: "2010-07-07", attribution: "Lexin", license: "CC BY 4.0" },
  entries: {
    fika: [{ word: "101", partOfSpeech: "substantiv", meaning: "", translation: "перерыв на кофе" }],
    fikapaus: [{ word: "102", partOfSpeech: "substantiv", meaning: "", translation: "перерыв на кофе" }],
  },
  swedishIndex: { fika: ["101"], fikapaus: ["102"] },
  russianIndex: { "перерыв на кофе": ["101", "102"] },
  relatedIndex: {},
  wordAliases: {},
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
  await expect(page.locator(".word-card[open] summary strong")).toHaveText("en fika");
});

test("pulling the top of the page down shows the sync spinner, and a short pull does not", async ({ page }) => {
  await page.route("**/lexin-dictionary.*.json", (route) =>
    route.fulfill({ contentType: "application/json", json: dictionary }),
  );
  await page.goto(".");
  await expect(page.locator(".pull-to-sync")).toBeAttached();
  const pull = (distance: number) => page.evaluate((y) => {
    const touch = (type: string, clientY?: number) => document.body.dispatchEvent(Object.assign(
      new Event(type, { bubbles: true }),
      { touches: clientY === undefined ? [] : [{ clientX: 100, clientY }] },
    ));
    touch("touchstart", 100);
    touch("touchmove", 100 + y);
    touch("touchend");
  }, distance);

  await pull(60);
  await expect(page.locator(".pull-to-sync[data-syncing]")).toHaveCount(0);
  await pull(200);
  await expect(page.locator(".pull-to-sync[data-syncing]")).toBeInViewport();
  await expect(page.locator(".pull-to-sync[data-syncing]")).toHaveCount(0);
});

test("a small sideways wobble at the start of a pull still syncs", async ({ page }) => {
  await page.route("**/lexin-dictionary.*.json", (route) =>
    route.fulfill({ contentType: "application/json", json: dictionary }),
  );
  await page.goto(".");
  await expect(page.locator(".pull-to-sync")).toBeAttached();
  await page.evaluate(() => {
    const touch = (type: string, clientX?: number, clientY?: number) => document.body.dispatchEvent(Object.assign(
      new Event(type, { bubbles: true }),
      { touches: clientY === undefined ? [] : [{ clientX, clientY }] },
    ));
    touch("touchstart", 100, 100);
    touch("touchmove", 103, 101);
    touch("touchmove", 100, 300);
    touch("touchend");
  });
  await expect(page.locator(".pull-to-sync[data-syncing]")).toBeInViewport();
});
