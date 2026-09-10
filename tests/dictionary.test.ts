import { describe, expect, it } from "vitest";
import type { DictionaryAsset } from "../src/dictionary-contract.ts";
import { createSearch } from "../src/dictionary.ts";

const dictionary = {
  metadata: {
    sourceEditionDate: "2010-07-07",
    attribution: "Lexin fixture",
    license: "CC BY 4.0",
  },
  entries: {
    bok: [
      { partOfSpeech: "subst.", meaning: "en samling sidor", translation: "книга" },
      { partOfSpeech: "verb", meaning: "reservera", translation: "бронировать" },
    ],
    hus: [{ partOfSpeech: "subst.", meaning: "byggnad", translation: "дом" }],
    hem: [{ partOfSpeech: "subst.", meaning: "plats där någon bor", translation: "дом" }],
    koja: [{ partOfSpeech: "subst.", meaning: "enkel bostad", translation: "дом" }],
    torp: [{ partOfSpeech: "subst.", meaning: "litet lantställe", translation: "дом" }],
    villa: [{ partOfSpeech: "subst.", meaning: "fristående bostad", translation: "дом" }],
    stuga: [{ partOfSpeech: "subst.", meaning: "litet hus", translation: "дом" }],
    residens: [{ partOfSpeech: "subst.", meaning: "officiell bostad", translation: "дом" }],
    hemvist: [{ partOfSpeech: "subst.", meaning: "stadigvarande plats", translation: "дом" }],
    byggnad: [{ partOfSpeech: "subst.", meaning: "uppförd konstruktion", translation: "дом" }],
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

  it("returns every canonical choice for Swedish and Russian prefixes", () => {
    expect(search("bo")).toEqual({
      kind: "choices",
      choices: [{ headword: "bok", translation: "книга" }],
    });
    expect(search("бро")).toEqual({
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
