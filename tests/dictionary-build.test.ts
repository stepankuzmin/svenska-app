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
    expect(assets.dictionary.entries.bok).toEqual([
      { partOfSpeech: "subst.", meaning: "en samling sidor", translation: "книга" },
      { partOfSpeech: "verb", meaning: "reservera", translation: "бронировать" },
    ]);
    expect(assets.details.entries.bok).toEqual([
      {
        phonetic: "bu:k",
        inflections: ["boken", "böcker"],
        examples: [{ swedish: "jag läser en bok", russian: "я читаю книгу" }],
        compounds: [{ swedish: "bokhylla", russian: "книжная полка" }],
      },
      { phonetic: "", inflections: [], examples: [], compounds: [] },
    ]);
  });

  it("indexes every translation against the headwords that carry it", () => {
    expect(assets.dictionary.russianIndex).toEqual({
      "бронировать": ["bok"],
      "дом": ["hus", "hem"],
      "жопа": ["arsle"],
      "книга": ["bok"],
      "младенец": ["baby"],
      "правдивый": ["sann"],
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
