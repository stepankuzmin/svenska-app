import { expect, test, type Page } from "@playwright/test";

const manyRussianHeadwords = Array.from(
  { length: 120 },
  (_, index) => `result-${String(index).padStart(3, "0")}`,
);
const manyRussianWord = (headword: string) => String(1000 + manyRussianHeadwords.indexOf(headword));

const dictionary = {
  metadata: { sourceEditionDate: "2010-07-07", attribution: "Lexin", license: "CC BY 4.0" },
  entries: {
    AB: [{ word: "101", partOfSpeech: "substantiv", meaning: "aktiebolag", translation: "АО" }],
    abort: [{ word: "102", partOfSpeech: "substantiv", meaning: "", translation: "аборт" }],
    "abort|rådgivning": [{ word: "103", partOfSpeech: "substantiv", meaning: "", translation: "консультация по аборту" }],
    anger: [{ word: "104", partOfSpeech: "verb", meaning: "meddela, uppge", translation: "сообщать" }],
    angett: [{ word: "105", partOfSpeech: "adjektiv", meaning: "uppgiven", translation: "указанный" }],
    fika: [{ word: "106", partOfSpeech: "substantiv", meaning: "", translation: "перерыв на кофе" }],
    fikapaus: [{ word: "107", partOfSpeech: "substantiv", meaning: "", translation: "перерыв на кофе" }],
    hem: [{ word: "108", partOfSpeech: "substantiv", meaning: "", translation: "дом" }],
    hus: [{ word: "109", partOfSpeech: "substantiv", meaning: "", translation: "дом" }],
    villa: [{ word: "110", partOfSpeech: "substantiv", meaning: "", translation: "дом" }],
    stuga: [{ word: "111", partOfSpeech: "substantiv", meaning: "", translation: "дом" }],
    koja: [{ word: "112", partOfSpeech: "substantiv", meaning: "", translation: "дом" }],
    residens: [{ word: "113", partOfSpeech: "substantiv", meaning: "", translation: "дом" }],
    bostad: [{ word: "114", partOfSpeech: "substantiv", meaning: "", translation: "жилой дом" }],
    dominant: [{ word: "115", partOfSpeech: "adjektiv", meaning: "", translation: "доминирующий" }],
    ...Object.fromEntries(manyRussianHeadwords.map((headword) => [
      headword,
      [{ word: manyRussianWord(headword), partOfSpeech: "substantiv", meaning: "", translation: `яц-${headword}` }],
    ])),
  },
  swedishIndex: {
    AB: ["101"],
    abort: ["102"],
    abortrådgivning: ["103"],
    ange: ["104"],
    anger: ["104"],
    angett: ["104", "105"],
    fika: ["106"],
    fikapaus: ["107"],
    hem: ["108"],
    hus: ["109"],
    villa: ["110"],
    stuga: ["111"],
    koja: ["112"],
    residens: ["113"],
    bostad: ["114"],
    dominant: ["115"],
    ...Object.fromEntries(manyRussianHeadwords.map((headword) => [headword, [manyRussianWord(headword)]])),
  },
  russianIndex: {
    "100 граммов": ["109"],
    "АО": ["101"],
    "дом": ["108", "109", "110", "111", "112", "113"],
    "доминирующий": ["115"],
    "перерыв на кофе": ["106", "107"],
    "жилой дом": ["114"],
    ...Object.fromEntries(manyRussianHeadwords.map((headword) => [`яц-${headword}`, [manyRussianWord(headword)]])),
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

test("autocomplete shows each word's type and translation and supports keyboard selection", async ({ page }) => {
  await openReadyApp(page);

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("fik");
  const options = page.getByRole("option");
  await expect(options).toHaveText([
    "fika substantiv · перерыв на кофе",
    "fikapaus substantiv · перерыв на кофе",
  ]);

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

  await expect(page.getByRole("option")).toHaveText([
    "abort substantiv · аборт",
    "abortrådgivning substantiv · консультация по аборту",
  ]);
});

test("an inflected Swedish query lists every matching indexed word", async ({ page }) => {
  await openReadyApp(page);

  await page.getByLabel("Swedish or Russian word").fill("ange");

  // `angett` inflects `anger` and is a word of its own, so it is offered twice,
  // each naming the word it opens, and a choice opens that word alone.
  await expect(page.getByRole("option")).toHaveText([
    "ange anger · verb · сообщать",
    "anger verb · сообщать",
    "angett anger · verb · сообщать",
    "angett adjektiv · указанный",
  ]);
  await page.getByRole("option", { name: "angett adjektiv · указанный" }).click();
  await expect(page.getByRole("region", { name: "Library" }).locator("strong")).toHaveText(["angett"]);

  await page.getByLabel("Swedish or Russian word").fill("ab");
  await expect(page.getByRole("option").first()).toHaveText("AB substantiv · АО");
});

test("a Russian word shows every matching Russian index entry", async ({ page }) => {
  await openReadyApp(page);

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("ао");
  await expect(page.getByRole("option")).toHaveText(["АО AB · substantiv"]);
  await expect(page.getByRole("option").locator("strong")).toHaveAttribute("lang", "ru");

  await query.fill("100");
  await expect(page.getByRole("option")).toHaveText([
    "100 граммов hus · substantiv",
    "яц-result-100 result-100 · substantiv",
    "result-100 substantiv · яц-result-100",
  ]);

  await query.fill("дом");

  // Six words translate as `дом`, and each is a suggestion of its own.
  await expect(page.getByRole("option")).toHaveText([
    "дом hem · substantiv",
    "дом hus · substantiv",
    "дом villa · substantiv",
    "дом stuga · substantiv",
    "дом koja · substantiv",
    "дом residens · substantiv",
    "жилой дом bostad · substantiv",
    "доминирующий dominant · adjektiv",
  ]);
  await expect(page.getByRole("option").first().locator("strong")).toHaveAttribute("lang", "ru");

  for (let index = 0; index < 8; index += 1) {
    await page.getByLabel("Swedish or Russian word").press("ArrowDown");
  }
  await expect(page.getByRole("option", { name: "доминирующий" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("option", { name: "доминирующий" })).toBeInViewport();

  await page.getByRole("option", { name: "дом hus · substantiv" }).click();
  await expect(page.getByRole("region", { name: "Library" }).locator("strong")).toHaveText(["hus"]);
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

test("the clear button empties the search field", async ({ page }) => {
  await openReadyApp(page);

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("fik");
  await expect(page.getByRole("option")).toHaveCount(2);

  await page.getByRole("button", { name: "Clear search" }).click();

  await expect(query).toHaveValue("");
  await expect(query).toBeFocused();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clear search" })).toHaveCount(0);
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

test("a q link opens every headword an exact word indexes", async ({ page }) => {
  await page.route("**/lexin-dictionary.*.json", (route) =>
    route.fulfill({ contentType: "application/json", json: dictionary }),
  );
  await page.goto("./?q=angett");

  const library = page.getByRole("region", { name: "Library" });
  await expect(library.getByRole("listitem")).toHaveText([/anger/, /angett/]);
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("a tap on the page background focuses the search field", async ({ page }) => {
  await openReadyApp(page);

  const query = page.getByLabel("Swedish or Russian word");
  await query.blur();
  await expect(query).not.toBeFocused();

  await page.getByText("Lexin, ISOF", { exact: true }).click();
  await expect(query).toBeFocused();
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
