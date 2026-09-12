import { describe, expect, it } from "vitest";
import type { DictionaryAsset } from "../src/dictionary-contract.ts";
import { createSearch } from "../src/dictionary.ts";

function sense(partOfSpeech: string, meaning: string, translation: string) {
  return { partOfSpeech, meaning, translation };
}

const dictionary = {
  metadata: {
    sourceEditionDate: "2010-07-07",
    attribution: "Lexin fixture",
    license: "CC BY 4.0",
  },
  entries: {
    bok: [
      sense("subst.", "en samling sidor", "книга"),
      sense("verb", "reservera", "бронировать"),
    ],
    hus: [sense("subst.", "byggnad", "дом")],
    hem: [sense("subst.", "plats där någon bor", "дом")],
    koja: [sense("subst.", "enkel bostad", "дом")],
    torp: [sense("subst.", "litet lantställe", "дом")],
    villa: [sense("subst.", "fristående bostad", "дом")],
    stuga: [sense("subst.", "litet hus", "дом")],
    residens: [sense("subst.", "officiell bostad", "дом")],
    hemvist: [sense("subst.", "stadigvarande plats", "дом")],
    byggnad: [sense("subst.", "uppförd konstruktion", "дом")],
  },
  russianIndex: {
    "бронировать": ["bok"],
    "дом": ["hus", "hem", "koja", "torp", "villa", "stuga", "residens", "hemvist", "byggnad"],
    "книга": ["bok"],
  },
} satisfies DictionaryAsset;

describe("dictionary lookup", () => {
  const search = createSearch({ dictionary });

  it("returns every sense for an exact canonical Swedish headword", () => {
    expect(search("bok")).toEqual({
      kind: "result",
      headword: "bok",
      senses: dictionary.entries.bok,
    });
  });

  it("returns the canonical Swedish result with every sense for an exact Russian translation", () => {
    expect(search(" КНИГА ")).toEqual({
      kind: "result",
      headword: "bok",
      senses: dictionary.entries.bok,
    });
  });

  it("returns canonical choices when an exact Russian translation matches multiple headwords", () => {
    expect(search("дом")).toEqual({
      kind: "choices",
      choices: [
        { headword: "hus", translation: "дом" },
        { headword: "hem", translation: "дом" },
        { headword: "koja", translation: "дом" },
        { headword: "torp", translation: "дом" },
        { headword: "villa", translation: "дом" },
        { headword: "stuga", translation: "дом" },
        { headword: "residens", translation: "дом" },
        { headword: "hemvist", translation: "дом" },
        { headword: "byggnad", translation: "дом" },
      ],
    });
  });

  it("returns every canonical choice containing the Swedish or Russian query", () => {
    expect(search("ok")).toEqual({
      kind: "choices",
      choices: [{ headword: "bok", translation: "книга" }],
    });
    expect(search("ниров")).toEqual({
      kind: "choices",
      choices: [{ headword: "bok", translation: "бронировать" }],
    });
    expect(search("д")).toEqual({
      kind: "choices",
      choices: [
        { headword: "hus", translation: "дом" },
        { headword: "hem", translation: "дом" },
        { headword: "koja", translation: "дом" },
        { headword: "torp", translation: "дом" },
        { headword: "villa", translation: "дом" },
        { headword: "stuga", translation: "дом" },
        { headword: "residens", translation: "дом" },
        { headword: "hemvist", translation: "дом" },
        { headword: "byggnad", translation: "дом" },
      ],
    });
  });

  it("returns no match in either lookup direction", () => {
    expect(search("xyz")).toEqual({ kind: "no-match" });
    expect(search("жюри")).toEqual({ kind: "no-match" });
  });
});
