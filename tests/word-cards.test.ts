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

  it("keeps each word's details off the other words of its spelling", () => {
    const [election] = wordCards({
      libraryWords: [{ headword: "val", word: "18440" }],
      entries,
      details: detailEntries,
    });

    expect(election).toMatchObject({
      forms: ["ett val", "valet", "val"],
      examples: [],
      relatedWords: [],
      hasMeanings: false,
    });
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
    // The library, the list and removal still name the word by Lexin's spelling.
    expect(boiled.card).toBe("hård|kokt#200");
  });
});

describe("an extended word card", () => {
  const bare = { och: [sense("300", "konj.", "", "и")] };

  function extendable(
    wordDetails: ReturnType<typeof details> | null,
    senses: DictionaryAsset["entries"] = bare,
  ) {
    const [card] = wordCards({
      libraryWords: [{ headword: "och", word: "300" }],
      entries: senses,
      details: wordDetails === null ? null : { och: [wordDetails] },
    });
    return card.extendable;
  }

  it("has nothing to extend to for a bare word", () => {
    expect(extendable(null)).toBe(false);
    expect(extendable(details({ inflections: [] }))).toBe(false);
  });

  it.each([
    ["a transcription", details({ phonetic: "åk:" })],
    ["more than one form", details({ inflections: ["ochar"] })],
    ["an example", details({ examples: [{ swedish: "du och jag", russian: "ты и я" }] })],
    ["a compound", details({ compounds: [{ swedish: "och|så", russian: "также" }] })],
  ])("opens for %s alone", (_reason, wordDetails) => {
    expect(extendable(wordDetails)).toBe(true);
  });

  it("opens for a meaning alone", () => {
    expect(extendable(null, { och: [sense("300", "konj.", "binder ihop ord", "и")] })).toBe(true);
  });
});

describe("the compounds a card lists", () => {
  function relatedWords(compounds: { swedish: string; russian: string }[]) {
    const [card] = wordCards({
      libraryWords: [{ headword: "och", word: "300" }],
      entries,
      details: { och: [details({ compounds })] },
    });
    return card.relatedWords;
  }

  it("lists at most eight", () => {
    const compounds = Array.from({ length: 10 }, (_, index) => ({ swedish: `och${index}`, russian: `${index}` }));

    expect(relatedWords(compounds).map(({ headword }) => headword)).toEqual(
      compounds.slice(0, 8).map(({ swedish }) => swedish),
    );
  });

  it("lists spellings that read alike once, with the translation Lexin gives last", () => {
    expect(relatedWords([
      { swedish: "Ock|så", russian: "также" },
      { swedish: "också", russian: "тоже" },
    ])).toEqual([{ headword: "också", translation: "тоже" }]);
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
