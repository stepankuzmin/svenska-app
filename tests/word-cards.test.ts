import { describe, expect, it } from "vitest";
import type { DictionaryAsset, DictionaryDetailsAsset } from "../src/dictionary-contract.ts";
import { firstCardOf, suggestionRow, wordCards } from "../src/word-cards.ts";

function sense(word: string, partOfSpeech: string, meaning: string, translation: string) {
  return { word, partOfSpeech, meaning, translation };
}

function details(overrides: Partial<DictionaryDetailsAsset["entries"][string][number]> = {}) {
  return { phonetic: "", article: "", inflections: [], examples: [], compounds: [], ...overrides };
}

const entries: DictionaryAsset["entries"] = {
  val: [
    sense("18439", "subst.", "stort däggdjur i havet", "кит"),
    sense("18440", "subst.", "", "выбор"),
    sense("18440", "subst.", "", "выборы"),
  ],
  "hård|kokt": [sense("200", "adj.", "", "сваренный вкрутую")],
  och: [sense("300", "konj.", "", "и")],
};

const detailEntries: DictionaryDetailsAsset["entries"] = {
  val: [
    details({
      phonetic: "va:l",
      article: "en",
      inflections: ["valen", "valar"],
      examples: [{ swedish: "en blå val", russian: "синий кит" }],
      compounds: [
        { swedish: "val|fångst", russian: "китобойный промысел" },
        { swedish: "val", russian: "кит" },
      ],
    }),
    details({ phonetic: "va:l", article: "ett", inflections: ["valet", "val"] }),
    details({ phonetic: "va:l", article: "ett", inflections: ["valet", "val"] }),
  ],
};

describe("word cards", () => {
  it("fills a card for each word the library keeps, in library order", () => {
    const cards = wordCards({
      libraryWords: [{ headword: "val", word: "18440" }, { headword: "val", word: "18439" }],
      entries,
      details: detailEntries,
    });

    expect(cards.map(({ card, translation }) => [card, translation])).toEqual([
      ["val#18440", "выбор · выборы"],
      ["val#18439", "кит"],
    ]);
  });

  it("carries the forms, meanings, examples and compounds of its own word", () => {
    const [whale] = wordCards({
      libraryWords: [{ headword: "val", word: "18439" }],
      entries,
      details: detailEntries,
    });

    expect(whale).toMatchObject({
      headword: "val",
      partsOfSpeech: "subst.",
      phonetics: ["va:l"],
      forms: ["en val", "valen", "valar"],
      examples: [{ swedish: "en blå val", russian: "синий кит" }],
      relatedWords: [{ headword: "valfångst", translation: "китобойный промысел" }],
      extendable: true,
    });
    expect(whale.senses).toEqual([entries.val[0]]);
  });

  it("gives a word with nothing beyond its closed line no extended state", () => {
    const [conjunction] = wordCards({
      libraryWords: [{ headword: "och", word: "300" }],
      entries,
      details: null,
    });

    expect(conjunction).toMatchObject({ headword: "och", translation: "и", extendable: false });
  });

  it("shows no card for a word the dictionary does not carry", () => {
    expect(wordCards({
      libraryWords: [{ headword: "saknas", word: "" }, { headword: "val", word: "77" }],
      entries,
      details: null,
    })).toEqual([]);
    expect(wordCards({ libraryWords: [{ headword: "val", word: "18439" }], entries: null, details: null }))
      .toEqual([]);
  });

  it("drops Lexin segment markers from the headword", () => {
    const [boiled] = wordCards({
      libraryWords: [{ headword: "hård|kokt", word: "200" }],
      entries,
      details: null,
    });

    expect(boiled.headword).toBe("hårdkokt");
  });
});

describe("suggestion rows", () => {
  it("reads like a card's closed line with the Swedish forms beneath", () => {
    expect(suggestionRow({ word: { headword: "val", word: "18440" }, entries, details: detailEntries }))
      .toEqual({
        headword: "val",
        partsOfSpeech: "subst.",
        translation: "выбор · выборы",
        forms: "ett val, valet, val",
      });
  });

  it("shows the headword alone for a word with no known forms", () => {
    expect(suggestionRow({ word: { headword: "hård|kokt", word: "200" }, entries, details: null }))
      .toEqual({ headword: "hårdkokt", partsOfSpeech: "adj.", translation: "сваренный вкрутую", forms: "hårdkokt" });
    expect(suggestionRow({ word: { headword: "saknas", word: "" }, entries: null, details: null }))
      .toEqual({ headword: "saknas", partsOfSpeech: "", translation: "", forms: "saknas" });
  });
});

describe("the card a lookup opens", () => {
  it("opens the first word its spelling holds", () => {
    expect(firstCardOf({ headword: "val", entries })).toBe("val#18439");
  });

  it("opens nothing for a spelling the dictionary does not carry", () => {
    expect(firstCardOf({ headword: "saknas", entries })).toBeNull();
    expect(firstCardOf({ headword: "val", entries: null })).toBeNull();
  });
});
