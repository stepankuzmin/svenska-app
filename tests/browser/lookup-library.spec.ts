import { expect, test, type Locator, type Page } from "@playwright/test";

const dictionary = {
  metadata: { sourceEditionDate: "2010-07-07", attribution: "Lexin", license: "CC BY 4.0" },
  entries: {
    abborre: [{ word: "101", partOfSpeech: "substantiv", meaning: "fisk", translation: "окунь" }],
    fika: [{ word: "102", partOfSpeech: "substantiv", meaning: "", translation: "перерыв на кофе" }],
    tack: [{ word: "103", partOfSpeech: "interjektion", meaning: "", translation: "спасибо" }],
    framgår: [{ word: "104", partOfSpeech: "verb", meaning: "visa sig av sammanhanget", translation: "вытекать" }],
    ni: [{ word: "10630", partOfSpeech: "pronomen", meaning: "", translation: "вы" }],
    jord: [
      { word: "7322", partOfSpeech: "substantiv", meaning: "planeten Tellus", translation: "земля" },
      { word: "7323", partOfSpeech: "substantiv", meaning: "mull, mylla", translation: "земля" },
    ],
    val: [
      { word: "18439", partOfSpeech: "substantiv", meaning: "stort havsdjur", translation: "кит" },
      { word: "18440", partOfSpeech: "substantiv", meaning: "det att välja", translation: "выбор" },
    ],
  },
  swedishIndex: {
    abborre: ["101"],
    abborren: ["101"],
    abborrar: ["101"],
    abborrarna: ["101"],
    fika: ["102"],
    fikan: ["102"],
    fikor: ["102"],
    fikorna: ["102"],
    tack: ["103"],
    framgår: ["104"],
    framgick: ["104"],
    framgått: ["104"],
    framgå: ["104"],
    ni: ["10630"],
    jord: ["7322", "7323"],
    val: ["18439", "18440"],
    valen: ["18439", "18440"],
    valar: ["18439"],
    valarna: ["18439"],
    valet: ["18440"],
  },
  russianIndex: {
    "перерыв на кофе": ["102"],
    "спасибо": ["103"],
    "вытекать": ["104"],
    "вы": ["10630"],
    "Вы": ["10630"],
    "земля": ["7322", "7323"],
    "кит": ["18439"],
    "выбор": ["18440"],
  },
};

const details = {
  sourceEditionDate: "2010-07-07",
  entries: {
    abborre: [{
      phonetic: "²ab:ɔr:e",
      article: "en",
      inflections: ["abborren", "abborrar", "abborrarna"],
      examples: [],
      compounds: [{ swedish: "abborrpinne", russian: "окунёк" }],
    }],
    fika: [{
      phonetic: "²fi:ka",
      article: "en",
      inflections: ["fikan", "fikor", "fikorna"],
      examples: [{ swedish: "ska vi fika?", russian: "пойдём выпьем кофе?" }],
      compounds: [
        { swedish: "fikapaus", russian: "перерыв на кофе" },
        { swedish: "kaffepaus", russian: "перерыв на кофе" },
      ],
    }],
    tack: [{ phonetic: "tak", article: "", inflections: [], examples: [], compounds: [] }],
    jord: [
      { phonetic: "jo:rd", article: "en", inflections: ["jorden"], examples: [], compounds: [] },
      {
        phonetic: "jo:rd",
        article: "en",
        inflections: ["jorden", "jordar", "jordarna"],
        examples: [],
        compounds: [],
      },
    ],
    val: [
      {
        phonetic: "vA:l",
        article: "en",
        inflections: ["valen", "valar", "valarna"],
        examples: [],
        compounds: [],
      },
      {
        phonetic: "vA:l",
        article: "ett",
        inflections: ["valet", "val", "valen"],
        examples: [],
        compounds: [],
      },
    ],
    framgår: [{
      phonetic: "²frAm:gå:r",
      article: "",
      inflections: ["framgick", "framgått", "framgå"],
      examples: [{ swedish: "hans åsikter framgick av intervjun", russian: "его взгляды стали ясны" }],
      compounds: [],
    }],
  },
};

test.beforeEach(async ({ page }) => {
  await page.route("**/lexin-dictionary.*.json", (route) =>
    route.fulfill({ contentType: "application/json", json: dictionary }),
  );
  await page.route("**/lexin-details.*.json", (route) =>
    route.fulfill({ contentType: "application/json", json: details }),
  );
});

test("an extended card includes compounds associated with the Lexin entry", async ({ page }) => {
  await page.goto(".");

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("abborre");
  await query.press("Enter");

  await expect(page.getByRole("region", { name: "Words containing abborre" }).getByText("abborrpinne")).toBeVisible();
});

test("chosen words persist in most-recent order and only one card is extended", async ({ page }) => {
  await page.goto(".");

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("fik");
  await expect(page.getByRole("option", { name: /^fika substantiv/ })).toBeVisible();
  await page.getByRole("option", { name: /^fika substantiv/ }).click();

  const library = page.getByRole("region", { name: "Library" });
  await expect(library.getByText("[²fi:ka]", { exact: true })).toBeVisible();
  await expect(library.getByText("en fika, fikan, fikor, fikorna", { exact: true })).toBeVisible();
  await expect(library.getByText("ska vi fika?", { exact: true })).toBeVisible();
  await expect(library.getByText("fikapaus", { exact: true })).toBeVisible();
  await expect(library.getByText("kaffepaus", { exact: true })).toBeVisible();

  await query.fill("спасибо");
  await query.press("ArrowDown");
  await query.press("Enter");
  await expect(library.getByText("tack", { exact: true })).toBeVisible();
  await expect(library.getByText("ska vi fika?", { exact: true })).toBeHidden();
  await expect(library.getByRole("listitem")).toHaveText([/tack/, /fika/]);

  await page.reload();
  await expect(page.getByRole("region", { name: "Library" }).getByRole("listitem")).toHaveText([/tack/, /fika/]);
  await expect(query).toBeFocused();
});

test("a q link opens its exact match rather than previewing it", async ({ page }) => {
  await page.goto("./?q=fika");

  const library = page.getByRole("region", { name: "Library" });
  await expect(library.getByText("[\u00b2fi:ka]", { exact: true })).toBeVisible();
  await expect(library.getByText("ska vi fika?", { exact: true })).toBeVisible();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.getByLabel("Swedish or Russian word")).toHaveValue("fika");
});

test("a q link opens a word two index entries lead to once", async ({ page }) => {
  await page.goto("./?q=вы");

  const cards = page.locator(".word-card-list > li");
  await expect(cards).toHaveCount(1);
  await expect(cards.nth(0)).toContainText("ni");
});

test("a q link with no exact match still previews suggestions", async ({ page }) => {
  await page.goto("./?q=fik");

  await expect(page.getByRole("option", { name: /^fika substantiv/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Library" })).toHaveCount(0);
});

test("a verb lists its Swedish forms from the infinitive", async ({ page }) => {
  await page.goto(".");

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("framgår");
  await query.press("Enter");

  await expect(
    page.getByRole("region", { name: "Library" })
      .getByText("att framgå, framgår, framgick, har framgått", { exact: true }),
  ).toBeVisible();
});

test("a noun lists its Swedish forms behind its article", async ({ page }) => {
  await page.goto(".");

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("abborre");
  await query.press("Enter");

  await expect(
    page.getByRole("region", { name: "Library" })
      .getByText("en abborre, abborren, abborrar, abborrarna", { exact: true }),
  ).toBeVisible();
});

test("an en-word and an ett-word of one spelling fill a card each", async ({ page }) => {
  await page.goto(".");

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("val");
  await query.press("Enter");

  const cards = page.locator(".word-card-list > li");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("en val, valen, valar, valarna");
  await expect(cards.nth(0)).toContainText("кит");
  await expect(cards.nth(0)).not.toContainText("выбор");
  await expect(cards.nth(1)).toContainText("ett val, valet, val, valen");
  await expect(cards.nth(1)).toContainText("выбор");
  await expect(cards.nth(1)).not.toContainText("кит");
});

test("the library keeps a word of its own rather than the spelling", async ({ page }) => {
  await page.goto(".");

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("val");
  await query.press("Enter");

  const cards = page.locator(".word-card-list > li");
  await expect(cards).toHaveCount(2);
  expect(JSON.parse(await page.evaluate("localStorage.getItem('svenska.lookup-library')") ?? "[]")).toEqual([
    { headword: "val", word: "18439" },
    { headword: "val", word: "18440" },
  ]);

  await page.reload();
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("кит");
});

test("a suggestion opens the one word it names", async ({ page }) => {
  await page.goto(".");

  await page.getByLabel("Swedish or Russian word").fill("val");
  await expect(page.getByRole("option")).toHaveText([
    "val substantiv кит en val, valen, valar, valarna",
    "val substantiv выбор ett val, valet, val, valen",
  ]);
  await page.getByRole("option", { name: /^val substantiv выбор/ }).click();

  const cards = page.locator(".word-card-list > li");
  await expect(cards).toHaveCount(1);
  await expect(cards.nth(0)).toContainText("выбор");
  expect(JSON.parse(await page.evaluate("localStorage.getItem('svenska.lookup-library')") ?? "[]")).toEqual([
    { headword: "val", word: "18440" },
  ]);
});

test("every suggestion reads the same way whether it has forms or not", async ({ page }) => {
  await page.goto(".");

  // `jord` the planet and `jord` the soil read apart by their forms.
  const query = page.getByLabel("Swedish or Russian word");
  const options = page.getByRole("option");
  await query.fill("земля");
  await expect(options).toHaveText([
    "jord substantiv земля en jord, jorden",
    "jord substantiv земля en jord, jorden, jordar, jordarna",
  ]);

  // A word with a single form still fills the forms line, so every row keeps
  // one shape.
  await query.fill("tack");
  await expect(options).toHaveText(["tack interjektion спасибо tack"]);
  const single = await options.first().boundingBox();
  await query.fill("val");
  await expect(options.first()).toHaveText("val substantiv кит en val, valen, valar, valarna");
  const several = await options.first().boundingBox();
  expect(single?.height).toBe(several?.height);
});

test("a library stored as spellings opens every word those spellings hold", async ({ page }) => {
  await page.goto(".");
  await page.evaluate(
    () => localStorage.setItem("svenska.lookup-library", JSON.stringify(["val", "tack"])),
  );
  await page.reload();

  const cards = page.locator(".word-card-list > li");
  await expect(cards).toHaveCount(3);
  expect(JSON.parse(await page.evaluate("localStorage.getItem('svenska.lookup-library')") ?? "[]")).toEqual([
    { headword: "val", word: "18439" },
    { headword: "val", word: "18440" },
    { headword: "tack", word: "103" },
  ]);
});

// A swipe is a distance covered over a time, and both decide whether the word
// goes. A browser test cannot hold the pace — the harness stretches every move,
// and a loaded runner stretches it further — so these swipes stay well clear of
// the flick, and `carriesWordOff` covers the pace itself where time is an input.
async function swipe(page: Page, card: Locator, { distance, over }: { distance: number; over: number }) {
  const surface = card.locator(".word-card-swipe");
  // A view transition hands hit testing to its own snapshot while it runs, so
  // the gesture waits for the card itself to take pointer events again.
  await surface.hover();
  const box = (await surface.boundingBox())!;
  const y = box.y + box.height / 2;
  const start = box.x + box.width - 24;
  const steps = 8;
  await page.mouse.move(start, y);
  await page.mouse.down();
  for (let step = 1; step <= steps; step += 1) {
    await page.mouse.move(start + (distance * step) / steps, y);
    await page.waitForTimeout(over / steps);
  }
  await page.mouse.up();
  // The card leaves before the library closes the gap, so let both play out.
  await page.waitForTimeout(600);
}

test("a swipe to the left removes a word from the library", async ({ page }) => {
  await page.goto(".");

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("val");
  await query.press("Enter");

  const cards = page.locator(".word-card-list > li");
  await expect(cards).toHaveCount(2);

  await swipe(page, cards.nth(0), { distance: -160, over: 240 });

  await expect(cards).toHaveCount(1);
  await expect(cards.nth(0)).toContainText("ett val, valet, val, valen");
  expect(JSON.parse(await page.evaluate("localStorage.getItem('svenska.lookup-library')") ?? "[]")).toEqual([
    { headword: "val", word: "18440" },
  ]);
});

test("a word a swipe pulls at without carrying off keeps its place", async ({ page }) => {
  await page.goto(".");

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("val");
  await query.press("Enter");

  const cards = page.locator(".word-card-list > li");
  // Removing a word cannot be undone: a pull this short and this slow is
  // neither the distance nor the flick that carries it off.
  await swipe(page, cards.nth(0), { distance: -70, over: 500 });

  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).locator(".word-card-swipe")).not.toHaveAttribute("data-swiping");
});

test("a collapsed card leaves on a swipe without opening on the way", async ({ page }) => {
  await page.goto(".");

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("abborre");
  await query.press("Enter");
  await query.fill("fika");
  await query.press("Enter");

  const cards = page.locator(".word-card-list > li");
  await expect(cards).toHaveCount(2);
  const collapsed = cards.nth(1);
  await expect(collapsed.locator("details")).not.toHaveAttribute("open");

  await swipe(page, collapsed, { distance: -70, over: 500 });
  await expect(cards).toHaveCount(2);
  await expect(collapsed.locator("details")).not.toHaveAttribute("open");

  await swipe(page, collapsed, { distance: -160, over: 240 });
  await expect(cards).toHaveCount(1);
  await expect(cards.nth(0)).toContainText("fika");
});

test("the card a swipe uncovers can be removed from the keyboard", async ({ page }) => {
  await page.goto(".");

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("val");
  await query.press("Enter");

  const cards = page.locator(".word-card-list > li");
  const remove = cards.nth(0).getByRole("button", { name: "Remove en val from the library" });
  await query.focus();
  await expect.poll(async () => {
    await page.keyboard.press("Tab");
    return remove.evaluate((button) => button.matches(":focus-visible"));
  }, { timeout: 5000 }).toBe(true);

  await expect(cards.nth(0).locator(".word-card-swipe")).not.toHaveCSS("transform", "none");
  await page.keyboard.press("Enter");

  await expect(cards).toHaveCount(1);
  await expect(cards.nth(0)).toContainText("выбор");
});

test("a word removed without motion leaves just the same", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(".");

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("val");
  await query.press("Enter");

  const cards = page.locator(".word-card-list > li");
  await swipe(page, cards.nth(0), { distance: -160, over: 240 });

  await expect(cards).toHaveCount(1);
});

test("a word without examples or related words cannot be extended", async ({ page }) => {
  await page.goto(".");

  const query = page.getByLabel("Swedish or Russian word");
  await query.fill("tack");
  await query.press("Enter");

  const library = page.getByRole("region", { name: "Library" });
  await expect(library.getByText("спасибо", { exact: true })).toBeVisible();
  await expect(library.getByRole("group")).toHaveCount(0);

  await query.fill("fika");
  await query.press("Enter");
  await expect(library.getByRole("group")).toHaveCount(1);
});
