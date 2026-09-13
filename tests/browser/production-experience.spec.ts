import { expect, test, type Page } from "@playwright/test";

const manyRussianHeadwords = Array.from(
  { length: 120 },
  (_, index) => `result-${String(index).padStart(3, "0")}`,
);

const dictionary = {
  metadata: { sourceEditionDate: "2010-07-07", attribution: "Lexin", license: "CC BY 4.0" },
  entries: {
    AB: [{ partOfSpeech: "substantiv", meaning: "aktiebolag", translation: "акционерное общество" }],
    abort: [{ partOfSpeech: "substantiv", meaning: "", translation: "аборт" }],
    "abort|rådgivning": [{ partOfSpeech: "substantiv", meaning: "", translation: "консультация по аборту" }],
    anger: [{ partOfSpeech: "verb", meaning: "meddela, uppge", translation: "сообщать" }],
    angett: [{ partOfSpeech: "adjektiv", meaning: "uppgiven", translation: "указанный" }],
    fika: [{ partOfSpeech: "substantiv", meaning: "", translation: "перерыв на кофе" }],
    fikapaus: [{ partOfSpeech: "substantiv", meaning: "", translation: "перерыв на кофе" }],
    hem: [{ partOfSpeech: "substantiv", meaning: "", translation: "дом" }],
    hus: [{ partOfSpeech: "substantiv", meaning: "", translation: "дом" }],
    villa: [{ partOfSpeech: "substantiv", meaning: "", translation: "дом" }],
    stuga: [{ partOfSpeech: "substantiv", meaning: "", translation: "дом" }],
    koja: [{ partOfSpeech: "substantiv", meaning: "", translation: "дом" }],
    residens: [{ partOfSpeech: "substantiv", meaning: "", translation: "дом" }],
    bostad: [{ partOfSpeech: "substantiv", meaning: "", translation: "жилой дом" }],
    dominant: [{ partOfSpeech: "adjektiv", meaning: "", translation: "доминирующий" }],
    ...Object.fromEntries(manyRussianHeadwords.map((headword) => [
      headword,
      [{ partOfSpeech: "substantiv", meaning: "", translation: `яц-${headword}` }],
    ])),
  },
  swedishIndex: {
    AB: ["AB"],
    abort: ["abort"],
    abortrådgivning: ["abort|rådgivning"],
    ange: ["anger"],
    anger: ["anger"],
    angett: ["anger", "angett"],
    fika: ["fika"],
    fikapaus: ["fikapaus"],
    hem: ["hem"],
    hus: ["hus"],
    villa: ["villa"],
    stuga: ["stuga"],
    koja: ["koja"],
    residens: ["residens"],
    bostad: ["bostad"],
    dominant: ["dominant"],
    ...Object.fromEntries(manyRussianHeadwords.map((headword) => [headword, [headword]])),
  },
  russianIndex: {
    "100 граммов": ["hus"],
    "дом": ["hem", "hus", "villa", "stuga", "koja", "residens"],
    "доминирующий": ["dominant"],
    "перерыв на кофе": ["fika", "fikapaus"],
    "жилой дом": ["bostad"],
    ...Object.fromEntries(manyRussianHeadwords.map((headword) => [`яц-${headword}`, [headword]])),
  },
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

test("autocomplete hides translations and supports keyboard selection", async ({ page }) => {
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

test("autocomplete selection keeps Lexin segment markers out of the input", async ({ page }) => {
  await openReadyApp(page);

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("abort");
  await page.getByRole("option", { name: "abortrådgivning" }).click();

  await expect(query).toHaveValue("abortrådgivning");
  await expect(page.getByRole("region", { name: "Library" }).getByText("abortrådgivning", { exact: true })).toBeVisible();
});

test("an exact Swedish match does not hide longer autocomplete matches", async ({ page }) => {
  await openReadyApp(page);

  await page.getByLabel("Swedish or Russian word").fill("abort");

  await expect(page.getByRole("option")).toHaveText(["abort", "abortrådgivning"]);
});

test("an inflected Swedish query lists every matching indexed word", async ({ page }) => {
  await openReadyApp(page);

  await page.getByLabel("Swedish or Russian word").fill("ange");

  await expect(page.getByRole("option")).toHaveText(["ange", "anger", "angett"]);

  await page.getByLabel("Swedish or Russian word").fill("ab");
  await expect(page.getByRole("option").first()).toHaveText("AB");
});

test("a Russian word shows every matching Russian index entry", async ({ page }) => {
  await openReadyApp(page);

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("100");
  await expect(page.getByRole("option")).toHaveText([
    "100 граммов",
    "яц-result-100",
    "result-100",
  ]);

  await query.fill("дом");

  await expect(page.getByRole("option")).toHaveText(["дом", "жилой дом", "доминирующий"]);
  await expect(page.getByText("дом", { exact: true })).toHaveAttribute("lang", "ru");

  for (let index = 0; index < 3; index += 1) {
    await page.getByLabel("Swedish or Russian word").press("ArrowDown");
  }
  await expect(page.getByRole("option", { name: "доминирующий" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("option", { name: "доминирующий" })).toBeInViewport();

  await page.getByRole("option", { name: "дом", exact: true }).click();
  await expect(page.getByRole("region", { name: "Library" }).locator("strong")).toHaveText([
    "hem",
    "hus",
    "villa",
    "stuga",
    "koja",
    "residens",
  ]);
});

test("a broad Russian lookup renders its suggestions incrementally", async ({ page }) => {
  await openReadyApp(page);

  await page.getByLabel("Swedish or Russian word").fill("яц");

  const options = page.getByRole("option");
  await expect(options).toHaveCount(100);
  await page.getByRole("listbox").evaluate((listbox) => {
    listbox.scrollTop = listbox.scrollHeight;
  });
  await expect(options).toHaveCount(120);
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
