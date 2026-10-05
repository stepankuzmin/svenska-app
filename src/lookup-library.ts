import { wordKey, type LibraryWord } from "./words";

const lookupLibraryStorageKey = "svenska.lookup-library";
// A library written before the app kept words holds bare headwords. The app
// bundle reads this by hand rather than carry a schema library for it.
function libraryWordOf(value: unknown): LibraryWord | null {
  if (typeof value === "string") {
    return { headword: value, word: "" };
  }

  const { headword, word } = (value ?? {}) as Partial<LibraryWord>;
  return typeof headword === "string" && typeof word === "string" ? { headword, word } : null;
}

// Reading `localStorage` itself throws where site data is blocked, so it is
// only touched inside the guard.
export function readLookupLibrary(): readonly LibraryWord[] {
  try {
    const storedLibrary: unknown = JSON.parse(localStorage.getItem(lookupLibraryStorageKey) ?? "[]");
    const libraryWords = Array.isArray(storedLibrary) ? storedLibrary.map(libraryWordOf) : [];
    // One entry the app cannot read spoils the library, as the schema did.
    return libraryWords.every((libraryWord) => libraryWord !== null) ? libraryWords : [];
  } catch {
    return [];
  }
}

export function writeLookupLibrary(libraryWords: readonly LibraryWord[]) {
  try {
    localStorage.setItem(lookupLibraryStorageKey, JSON.stringify(libraryWords));
  } catch {
    // Lookups still work when browser storage is unavailable.
  }
}

// Opened words move to the top in the order they were opened. Two index
// entries can lead to one word, as `вы` and `Вы` both lead to `ni`, and the
// word joins the library once.
export function addToLookupLibrary({
  libraryWords,
  openedWords,
}: {
  libraryWords: readonly LibraryWord[];
  openedWords: readonly LibraryWord[];
}): readonly LibraryWord[] {
  const uniqueOpenedWords = [...new Map(openedWords.map((word) => [wordKey(word), word])).values()];
  const openedKeys = new Set(uniqueOpenedWords.map(wordKey));
  return [
    ...uniqueOpenedWords,
    ...libraryWords.filter((libraryWord) => !openedKeys.has(wordKey(libraryWord))),
  ];
}
