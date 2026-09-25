import { describe, expect, it } from "vitest";
import {
  addToLookupLibrary,
  readLookupLibrary,
  removeFromLookupLibrary,
  writeLookupLibrary,
} from "../src/lookup-library.ts";

function memoryStorage(initial: string | null = null) {
  let stored = initial;
  return {
    getItem: () => stored,
    setItem: (_key: string, value: string) => {
      stored = value;
    },
    read: () => stored,
  };
}

const whale = { headword: "val", word: "18439" };
const election = { headword: "val", word: "18440" };
const impression = { headword: "intryck", word: "" };

describe("a stored lookup library", () => {
  it("reads back the words it wrote", () => {
    const storage = memoryStorage();
    writeLookupLibrary([whale, impression], storage);

    expect(readLookupLibrary(storage)).toEqual([whale, impression]);
  });

  it("reads bare headwords stored before the app kept words", () => {
    expect(readLookupLibrary(memoryStorage(JSON.stringify(["val", "intryck"])))).toEqual([
      { headword: "val", word: "" },
      { headword: "intryck", word: "" },
    ]);
  });

  it("starts empty when nothing is stored or the stored value is not a library", () => {
    expect(readLookupLibrary(memoryStorage())).toEqual([]);
    expect(readLookupLibrary(memoryStorage("{not json"))).toEqual([]);
    expect(readLookupLibrary(memoryStorage(JSON.stringify({ val: 1 })))).toEqual([]);
  });

  it("keeps lookups working when browser storage refuses", () => {
    const refusing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(readLookupLibrary(refusing)).toEqual([]);
    expect(() => writeLookupLibrary([whale], refusing)).not.toThrow();
  });
});

describe("opening words", () => {
  it("puts opened words at the top in the order they opened", () => {
    expect(addToLookupLibrary({
      libraryWords: [impression],
      openedWords: [whale, election],
    })).toEqual([whale, election, impression]);
  });

  it("moves a word already in the library to the top rather than keeping it twice", () => {
    expect(addToLookupLibrary({
      libraryWords: [impression, election],
      openedWords: [election],
    })).toEqual([election, impression]);
  });

  it("adds a word two index entries lead to once", () => {
    expect(addToLookupLibrary({
      libraryWords: [],
      openedWords: [whale, { ...whale }],
    })).toEqual([whale]);
  });
});

describe("removing a word", () => {
  it("removes only the word its card names", () => {
    expect(removeFromLookupLibrary({
      libraryWords: [whale, election, impression],
      card: "val#18440",
    })).toEqual([whale, impression]);
  });

  it("names a word that has no number by its spelling", () => {
    expect(removeFromLookupLibrary({
      libraryWords: [whale, impression],
      card: "intryck",
    })).toEqual([whale]);
  });
});
