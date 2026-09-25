import { expect, test, type Page } from "@playwright/test";

const firstSuggestion = /lookup-suggestions-0/;
const secondSuggestion = /lookup-suggestions-1/;
const anySuggestion = /lookup-suggestions/;
const fikaHeadword = /^fika$/;
const fikapausOption = /^fikapaus /;
const fikaOption = /^fika /;
const angettAdjective = /^angett adjektiv/;
const dominantOption = /^dominant /;
const husOption = /^hus /;
const angerThenAngett = [/anger/, /angett/];

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
  // Every suggestion reads the same way: the word, its type and translation,
  // and its Swedish forms beneath.
  await expect(options).toHaveText([
    "fika substantiv перерыв на кофе en fika, fikan, fikat",
    "fikapaus substantiv перерыв на кофе fikapaus",
  ]);

  await query.press("ArrowDown");
  await expect(query).toHaveAttribute("aria-activedescendant", firstSuggestion);
  await query.press("Enter");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Library" }).getByRole("strong").filter({ hasText: fikaHeadword })).toBeVisible();
  await expect(query).toBeFocused();
});

test("a selection empties the field and keeps Lexin segment markers out of the card", async ({ page }) => {
  await openReadyApp(page);

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("abort");
  await page.getByRole("option", { name: "abortrådgivning" }).click();

  await expect(query).toHaveValue("");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Library" }).getByText("abortrådgivning", { exact: true })).toBeVisible();
});

test("submitting the field empties it the way a selection does", async ({ page }) => {
  await openReadyApp(page);

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("fika");
  await query.press("Enter");

  await expect(query).toHaveValue("");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Library" }).locator("strong")).toHaveText(["fika"]);
});

test("a query the dictionary cannot place says so", async ({ page }) => {
  await openReadyApp(page);

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("zzzz");

  await expect(page.getByText("No matches")).toBeVisible();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  // The panel stands one suggestion row tall, as a row of the list it replaces.
  const panel = await page.getByText("No matches").boundingBox();
  expect(panel?.height).toBeCloseTo(60, 0);
  // The field and the panel read as one outlined unit, as they do when the
  // suggestion list is open.
  const blue = "rgb(7, 94, 184)";
  await expect(query).toHaveCSS("border-top-color", blue);
  await expect(page.getByText("No matches")).toHaveCSS("border-top-color", blue);

  await query.fill("fik");
  await expect(page.getByText("No matches")).toHaveCount(0);
  await expect(page.getByRole("option")).toHaveCount(2);
});

test("tabbing out of the field closes the suggestions", async ({ page }) => {
  await openReadyApp(page);

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("fik");
  await expect(page.getByRole("option")).toHaveCount(2);

  await query.press("Tab");

  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("the pointer and the keyboard agree on which row is active", async ({ page }) => {
  await openReadyApp(page);

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("fik");
  await query.press("ArrowDown");
  await expect(query).toHaveAttribute("aria-activedescendant", firstSuggestion);

  await page.getByRole("option", { name: fikapausOption }).hover();
  await expect(query).toHaveAttribute("aria-activedescendant", secondSuggestion);
  await expect(page.getByRole("option", { name: fikapausOption })).toHaveAttribute("aria-selected", "true");

  // ArrowUp from the first row hands the caret back to the field rather than
  // wrapping to a row that moves as the list grows.
  await query.press("ArrowUp");
  await query.press("ArrowUp");
  await expect(query).not.toHaveAttribute("aria-activedescendant", anySuggestion);
  await expect(page.getByRole("option", { name: fikaOption })).toHaveAttribute("aria-selected", "false");
});

test("tapping the page closes the suggestions and leaves them closed", async ({ page }) => {
  await openReadyApp(page);

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("fik");
  await expect(page.getByRole("option")).toHaveCount(2);

  await page.locator("main.minimal-lookup").click({ position: { x: 2, y: 2 } });

  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(query).toHaveValue("fik");
});

test("an exact Swedish match does not hide longer autocomplete matches", async ({ page }) => {
  await openReadyApp(page);

  await page.getByLabel("Swedish or Russian word").fill("abort");

  await expect(page.getByRole("option").locator("strong")).toHaveText(["abort", "abortrådgivning"]);
});

test("an inflected Swedish query lists each matching word once, under its headword", async ({ page }) => {
  await openReadyApp(page);

  await page.getByLabel("Swedish or Russian word").fill("ange");

  // `ange` and `angett` inflect `anger`, which is offered once, and `angett` is
  // also a word of its own; a choice opens that word alone.
  await expect(page.getByRole("option")).toHaveText([
    "anger verb сообщать att ange, anger, angav, har angett",
    "angett adjektiv указанный angett",
  ]);
  await page.getByRole("option", { name: angettAdjective }).click();
  await expect(page.getByRole("region", { name: "Library" }).locator("strong")).toHaveText(["angett"]);

  await page.getByLabel("Swedish or Russian word").fill("ab");
  await expect(page.getByRole("option").first().locator("strong")).toHaveText("AB");
});

test("a Russian query offers the Swedish words its translations belong to", async ({ page }) => {
  await openReadyApp(page);

  // A Russian query offers the same rows a Swedish one does, with what it
  // matched among the translations.
  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("ао");
  await expect(page.getByRole("option")).toHaveText(["AB substantiv АО AB"]);
  await expect(page.getByRole("option").locator("strong")).toHaveAttribute("lang", "sv");

  // `result-100` matches as a Swedish word and by its translation, and is
  // offered once.
  await query.fill("100");
  await expect(page.getByRole("option").locator("strong")).toHaveText(["hus", "result-100"]);

  await query.fill("дом");

  // Six words translate as `дом`, and each is a suggestion of its own.
  await expect(page.getByRole("option").locator("strong")).toHaveText([
    "hem",
    "hus",
    "villa",
    "stuga",
    "koja",
    "residens",
    "bostad",
    "dominant",
  ]);

  for (let index = 0; index < 8; index += 1) {
    await page.getByLabel("Swedish or Russian word").press("ArrowDown");
  }
  await expect(page.getByRole("option", { name: dominantOption })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("option", { name: dominantOption })).toBeInViewport();

  await page.getByRole("option", { name: husOption }).click();
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

test("a suggestion list that runs on ends halfway through a row", async ({ page }) => {
  await openReadyApp(page);

  const query = page.getByLabel("Swedish or Russian word");
  const listbox = page.getByRole("listbox");
  const rowsShown = () => listbox.evaluate((list) => list.clientHeight / list.querySelector("li")!.offsetHeight);
  const fade = () => page.evaluate<number>(
    'Number(getComputedStyle(document.querySelector("[role=listbox]"), "::after").opacity)',
  );

  await query.fill("яц");
  await expect(page.getByRole("option")).toHaveCount(100);
  expect((await rowsShown()) % 1).toBeCloseTo(0.5, 1);
  if (await page.evaluate<boolean>('CSS.supports("animation-timeline: scroll()")')) {
    await expect.poll(fade).toBe(1);
  }

  await query.fill("fik");
  await expect(page.getByRole("option")).toHaveCount(2);
  expect((await rowsShown()) % 1).toBeCloseTo(0, 1);
  expect(await fade()).toBe(0);
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
  await expect(library.getByRole("listitem")).toHaveText(angerThenAngett);
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
