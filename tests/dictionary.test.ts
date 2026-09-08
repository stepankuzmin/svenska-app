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

  it("returns one canonical choice per headword for Swedish and Russian prefixes", () => {
    expect(search("bo")).toEqual({
      kind: "choices",
      choices: [{ headword: "bok", translation: "книга" }],
    });
    expect(search("бро")).toEqual({
      kind: "choices",
      choices: [{ headword: "bok", translation: "бронировать" }],
    });
  });

  it("returns no match in either lookup direction", () => {
    expect(search("xyz")).toEqual({ kind: "no-match" });
    expect(search("жюри")).toEqual({ kind: "no-match" });
  });
});
