import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { buildDictionaryAssets } from "../scripts/build-dictionary.ts";
import {
  createSearch,
  hasDictionaryAssetShape,
  hasDictionaryDetailsShape,
} from "../src/dictionary.ts";

type Assets = ReturnType<typeof buildDictionaryAssets>;

let assets: Assets;
let search: ReturnType<typeof createSearch>;

beforeAll(async () => {
  const xml = await readFile(new URL("./fixtures/lexin-small.xml", import.meta.url), "utf8");
  assets = buildDictionaryAssets({ xml });
  search = createSearch({ dictionary: assets.dictionary });
});

function closestSuggestion(query: string) {
  const outcome = search(query);
  return outcome.kind === "result" ? outcome.suggestions[0] : null;
}

describe("Lexin source edition import", () => {
  it("groups every sense of a headword and keeps its details alongside", () => {
    expect(assets.dictionary.metadata).toEqual({
      sourceEditionDate: "2010-07-07",
      attribution: "Lexin: Svensk-ryskt lexikon — Institutet för språk och folkminnen (Språkrådet)",
      license: "CC BY 4.0",
    });
    // Lexin numbers the book and the verb apart, so the spelling holds two words.
    expect(assets.dictionary.entries.bok).toEqual([
      { word: "1", partOfSpeech: "subst.", meaning: "en samling sidor", translation: "книга" },
      { word: "14", partOfSpeech: "verb", meaning: "reservera", translation: "бронировать" },
    ]);
    expect(assets.dictionary.entries.hus).toEqual([
      { word: "", partOfSpeech: "subst.", meaning: "byggnad", translation: "дом" },
    ]);
    expect(assets.details.entries.bok).toEqual([
      {
        phonetic: "bu:k",
        article: "en",
        inflections: ["boken", "böcker", "böckerna"],
        examples: [{ swedish: "jag läser en bok", russian: "я читаю книгу" }],
        compounds: [{ swedish: "bokhylla", russian: "книжная полка" }],
      },
      { phonetic: "", article: "", inflections: [], examples: [], compounds: [] },
    ]);
  });

  it("completes a noun's paradigm with the definite plural Lexin leaves implicit", () => {
    expect(assets.details.entries.bok[0].inflections).toEqual(["boken", "böcker", "böckerna"]);
    expect(assets.details.entries.taxi[0].inflections).toEqual(["taxin", "taxi", "taxina"]);
    // An adjective's comparative and superlative belong to a paradigm the word
    // card does not show, so they stay out of its forms.
    expect(assets.details.entries.sann[0].inflections).toEqual(["sant", "sanna"]);
  });

  it("reads a noun's article from the definite singular Lexin spells out", () => {
    expect(assets.details.entries.bok[0].article).toBe("en");
    expect(assets.details.entries.arsle[0].article).toBe("ett");
    // A word Lexin marks as plural lists a definite plural, not a definite
    // singular, so it carries no article.
    expect(assets.details.entries.jeans[0].article).toBe("");
    expect(assets.details.entries.hus[0].article).toBe("");
  });

  it("indexes every translation against the headwords that carry it", () => {
    expect(assets.dictionary.russianIndex).toEqual({
      "бронировать": ["bok"],
      "дом": ["hus", "hem"],
      "жопа": ["arsle"],
      "книга": ["bok"],
      "младенец": ["baby"],
      "правдивый": ["sann"],
      "джинсы": ["jeans"],
      "сентиментальная ценность": ["affektions|värde"],
      "совместимый": ["förenlig"],
      "сообщать": ["anger"],
      "такси": ["taxi"],
      "хуже": ["värre"],
      "экшн": ["action"],
      "АО": ["AB"],
    });
  });

  it("adds the definite plural and comparative forms Lexin leaves implicit", () => {
    expect(assets.dictionary.swedishIndex).toMatchObject({
      arslena: ["arsle"],
      affektionsvärdena: ["affektions|värde"],
      babyarna: ["baby"],
      babyerna: ["baby"],
      böckerna: ["bok"],
      sannare: ["sann"],
      sannast: ["sann"],
      taxina: ["taxi"],
    });
  });

  it("leaves out forms the pattern would otherwise invent", () => {
    // A noun whose plural already reads as definite, a comparative Lexin
    // spells out, and an adjective marked as already comparative.
    for (const form of [
      "actionen",
      "actionna",
      "affektionsvärdenaen",
      "förenligare",
      "förenligast",
      "taxien",
      "värstare",
      "värstast",
    ]) {
      expect(assets.dictionary.swedishIndex).not.toHaveProperty(form);
    }
  });

  it("resolves a generated inflection to its canonical headword", () => {
    for (const [form, headword] of [["böckerna", "bok"], ["arslena", "arsle"], ["sannare", "sann"]]) {
      expect(search(form)).toMatchObject({ kind: "result", headword });
    }
  });

  it("matches an uppercase headword and translation typed in lower case", () => {
    expect(search("ab")).toMatchObject({ kind: "result", headword: "AB" });
    expect(closestSuggestion("ab")).toEqual({ displayWord: "AB", headwords: ["AB"], language: "sv" });
    expect(closestSuggestion("ао")).toEqual({ displayWord: "АО", headwords: ["AB"], language: "ru" });
  });

  it("accepts a shaped asset at startup without inspecting every sense", () => {
    const metadata = { sourceEditionDate: "2010-07-07", attribution: "Lexin", license: "CC BY 4.0" };

    expect(hasDictionaryAssetShape({
      metadata,
      entries: { bok: [{}] },
      swedishIndex: { bok: ["bok"] },
      russianIndex: { "книга": ["bok"] },
    })).toBe(true);
    expect(hasDictionaryAssetShape({ metadata, entries: { bok: {} }, swedishIndex: {}, russianIndex: {} })).toBe(false);
    expect(hasDictionaryAssetShape({ metadata: {}, entries: {}, swedishIndex: {}, russianIndex: {} })).toBe(false);
  });

  it("requires a details asset to carry a source edition and array entries", () => {
    expect(hasDictionaryDetailsShape({ sourceEditionDate: "2010-07-07", entries: { bok: [] } })).toBe(true);
    expect(hasDictionaryDetailsShape({ entries: { bok: [] } })).toBe(false);
    expect(hasDictionaryDetailsShape({ sourceEditionDate: "2010-07-07", entries: { bok: {} } })).toBe(false);
  });
});
