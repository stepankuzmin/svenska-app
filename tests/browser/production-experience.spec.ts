import { expect, test, type Page } from "@playwright/test";

const dictionary = {
  metadata: { sourceEditionDate: "2010-07-07", attribution: "Lexin", license: "CC BY 4.0" },
  entries: {
    fika: [{ partOfSpeech: "substantiv", meaning: "", translation: "перерыв на кофе" }],
    fikapaus: [{ partOfSpeech: "substantiv", meaning: "", translation: "перерыв на кофе" }],
  },
  russianIndex: { "перерыв на кофе": ["fika", "fikapaus"] },
};

async function openReadyApp(page: Page) {
  await page.route("**/lexin-dictionary.*.json", (route) =>
    route.fulfill({ contentType: "application/json", json: dictionary }),
  );
  await page.goto(".");
  await expect(page.getByRole("status")).toBeEmpty();
}

test("the search input accepts typing as soon as the app starts", async ({ page }) => {
  await page.route("**/lexin-dictionary.*.json", () => new Promise(() => {}));
  await page.goto(".");

  const query = page.getByLabel("Swedish or Russian word");
  await expect(query).toBeFocused();
  await page.keyboard.type("fika");
  await expect(query).toHaveValue("fika");
});

test("autocomplete is headword-only and supports keyboard selection", async ({ page }) => {
  await openReadyApp(page);

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("fik");
  const options = page.getByRole("option");
  await expect(options).toHaveText(["fika", "fikapaus"]);
  await expect(page.getByText("перерыв на кофе")).toHaveCount(0);

  await query.press("ArrowDown");
  await expect(query).toHaveAttribute("aria-activedescendant", /lookup-suggestions-0/);
  await query.press("Enter");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Library" }).getByRole("strong").filter({ hasText: /^fika$/ })).toBeVisible();
  await expect(query).toBeFocused();
});

test("the minimal layout fits a narrow zoomed viewport and keeps visible focus", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openReadyApp(page);

  expect(await page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")).toBe(true);
  await expect(page.locator("main")).toHaveCSS("max-width", "none");

  const query = page.getByLabel("Swedish or Russian word");
  await query.focus();
  await expect(query).not.toHaveCSS("outline-style", "none");
  await expect(page.locator("header, footer, main button")).toHaveCount(0);
});

test("the shipped interface credits the dictionary source and license", async ({ page }) => {
  await openReadyApp(page);

  await expect(page.getByText("Lexin, ISOF", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute(
    "href",
    "https://creativecommons.org/licenses/by/4.0/",
  );
});

test("the dark-mode focus indicator meets non-text contrast", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openReadyApp(page);

  await page.getByLabel("Swedish or Russian word").focus();
  const contrast = await page.evaluate(`(() => {
    function luminance(color) {
      const channels = color.match(/[\\d.]+/g)?.slice(0, 3).map(Number) ?? [];
      const linear = channels.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    }

    const inputStyle = getComputedStyle(document.querySelector("input"));
    const mainStyle = getComputedStyle(document.querySelector("main"));
    const foreground = luminance(inputStyle.outlineColor);
    const background = luminance(mainStyle.backgroundColor);
    return (Math.max(foreground, background) + 0.05) /
      (Math.min(foreground, background) + 0.05);
  })()`);

  expect(contrast).toBeGreaterThanOrEqual(3);
});

test("dictionary loading is the only announced interstitial state", async ({ page }) => {
  await page.route("**/lexin-dictionary.*.json", () => new Promise(() => {}));
  await page.goto(".");
  await expect(page.getByRole("status")).toHaveText("Loading dictionary…");
});
