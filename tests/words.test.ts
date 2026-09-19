import { describe, expect, it } from "vitest";
import type { DictionaryAsset } from "../src/dictionary-contract.ts";
import { resolveLibraryWords, wordKey, wordsOf } from "../src/words.ts";

function sense(word: string, translation: string) {
  return { word, partOfSpeech: "subst.", meaning: "", translation };
}

const entries: DictionaryAsset["entries"] = {
  val: [sense("18439", "кит"), sense("18440", "выбор"), sense("18440", "выборы")],
  intryck: [sense("", "впечатление")],
};

describe("words of a spelling", () => {
  it("keeps every sense of one word together, in the order Lexin lists them", () => {
    expect(wordsOf({ headword: "val", senses: entries.val })).toEqual([
      { headword: "val", word: "18439", senseIndexes: [0] },
      { headword: "val", word: "18440", senseIndexes: [1, 2] },
    ]);
  });

  it("reads a spelling that holds one word as that word", () => {
    expect(wordsOf({ headword: "intryck", senses: entries.intryck })).toEqual([
      { headword: "intryck", word: "", senseIndexes: [0] },
    ]);
  });

  it("names a word by its spelling alone when the spelling holds no other", () => {
    expect(wordKey({ headword: "intryck", word: "" })).toBe("intryck");
    expect(wordKey({ headword: "val", word: "18440" })).toBe("val#18440");
  });
});

describe("a stored lookup library", () => {
  it("opens every word of a spelling stored before the app kept words", () => {
    expect(resolveLibraryWords({
      libraryWords: [{ headword: "val", word: "" }, { headword: "intryck", word: "" }],
      entries,
    })).toEqual([
      { headword: "val", word: "18439" },
      { headword: "val", word: "18440" },
      { headword: "intryck", word: "" },
    ]);
  });

  it("leaves a library the dictionary resolves as it stands untouched", () => {
    const libraryWords = [{ headword: "val", word: "18440" }, { headword: "intryck", word: "" }];

    expect(resolveLibraryWords({ libraryWords, entries })).toBe(libraryWords);
  });

  it("opens a word this dictionary no longer numbers as every word of its spelling", () => {
    expect(resolveLibraryWords({
      libraryWords: [{ headword: "val", word: "77" }],
      entries,
    })).toEqual([
      { headword: "val", word: "18439" },
      { headword: "val", word: "18440" },
    ]);
  });

  it("keeps a spelling this dictionary does not carry, and opens no word twice", () => {
    expect(resolveLibraryWords({
      libraryWords: [
        { headword: "saknas", word: "" },
        { headword: "val", word: "18439" },
        { headword: "val", word: "" },
      ],
      entries,
    })).toEqual([
      { headword: "saknas", word: "" },
      { headword: "val", word: "18439" },
      { headword: "val", word: "18440" },
    ]);
  });
});
