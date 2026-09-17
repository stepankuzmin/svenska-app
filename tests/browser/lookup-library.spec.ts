import { expect, test } from "@playwright/test";

const dictionary = {
  metadata: { sourceEditionDate: "2010-07-07", attribution: "Lexin", license: "CC BY 4.0" },
  entries: {
    abborre: [{ partOfSpeech: "substantiv", meaning: "fisk", translation: "окунь" }],
    fika: [{ partOfSpeech: "substantiv", meaning: "", translation: "перерыв на кофе" }],
    tack: [{ partOfSpeech: "interjektion", meaning: "", translation: "спасибо" }],
    framgår: [{ partOfSpeech: "verb", meaning: "visa sig av sammanhanget", translation: "вытекать" }],
  },
  swedishIndex: {
    abborre: ["abborre"],
    abborren: ["abborre"],
    abborrar: ["abborre"],
    abborrarna: ["abborre"],
    fika: ["fika"],
    fikan: ["fika"],
    fikor: ["fika"],
    fikorna: ["fika"],
    tack: ["tack"],
    framgår: ["framgår"],
    framgick: ["framgår"],
    framgått: ["framgår"],
    framgå: ["framgår"],
  },
  russianIndex: { "перерыв на кофе": ["fika"], "спасибо": ["tack"], "вытекать": ["framgår"] },
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
  await expect(page.getByRole("option", { name: "fika", exact: true })).toBeVisible();
  await page.getByRole("option", { name: "fika", exact: true }).click();

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

test("a q link with no exact match still previews suggestions", async ({ page }) => {
  await page.goto("./?q=fik");

  await expect(page.getByRole("option", { name: "fika", exact: true })).toBeVisible();
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
