import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addToLookupLibrary,
  readLookupLibrary,
  writeLookupLibrary,
} from "../src/lookup-library.ts";
import { reduceLookupSession } from "../src/lookup-session.ts";

const storageKey = "svenska.lookup-library";

function stubStorage(initial: Record<string, string> = {}) {
  const stored = new Map(Object.entries(initial));
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => {
      stored.set(key, value);
    },
  });
  return stored;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const whale = { headword: "val", word: "18439" };
const election = { headword: "val", word: "18440" };
const impression = { headword: "intryck", word: "" };

describe("a stored lookup library", () => {
  // Renaming the key or reshaping the stored words would empty every existing
  // library, so both are pinned.
  it("writes each word as its spelling and number under the library's key", () => {
    const stored = stubStorage();
    writeLookupLibrary([whale, impression]);

    expect([...stored.keys()]).toEqual([storageKey]);
    expect(stored.get(storageKey)).toBe(
      '[{"headword":"val","word":"18439"},{"headword":"intryck","word":""}]',
    );
  });

  it("reads back the words it wrote", () => {
    stubStorage();
    writeLookupLibrary([whale, impression]);

    expect(readLookupLibrary()).toEqual([whale, impression]);
  });

  it("reads bare headwords stored before the app kept words", () => {
    stubStorage({ [storageKey]: JSON.stringify(["val", "intryck"]) });

    expect(readLookupLibrary()).toEqual([
      { headword: "val", word: "" },
      { headword: "intryck", word: "" },
    ]);
  });

  it("starts empty when nothing is stored or the stored value is not a library", () => {
    stubStorage();
    expect(readLookupLibrary()).toEqual([]);
    stubStorage({ [storageKey]: "{not json" });
    expect(readLookupLibrary()).toEqual([]);
    stubStorage({ [storageKey]: JSON.stringify({ val: 1 }) });
    expect(readLookupLibrary()).toEqual([]);
  });

  it("ignores what other keys hold", () => {
    stubStorage({ "svenska.other": JSON.stringify(["val"]) });

    expect(readLookupLibrary()).toEqual([]);
  });

  it("keeps lookups working when browser storage refuses", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });

    expect(readLookupLibrary()).toEqual([]);
    expect(() => writeLookupLibrary([whale])).not.toThrow();
  });

  it("keeps lookups working where reading browser storage itself throws", () => {
    vi.stubGlobal("localStorage", undefined);

    expect(readLookupLibrary()).toEqual([]);
    expect(() => writeLookupLibrary([whale])).not.toThrow();
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

function removeWord(libraryWords: readonly (typeof whale)[], card: string) {
  const session = { query: "", libraryWords, expandedCard: null, opens: 0 };
  return reduceLookupSession({ session, event: { kind: "word-removed", card }, entries: null }).libraryWords;
}

describe("removing a word", () => {
  it("removes only the word its card names", () => {
    expect(removeWord([whale, election, impression], "val#18440")).toEqual([whale, impression]);
  });

  it("names a word that has no number by its spelling", () => {
    expect(removeWord([whale, impression], "intryck")).toEqual([whale]);
  });
});
