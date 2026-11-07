import { uniqueWords, wordKey, type LibraryWord } from "./words";
import type { DictionaryAsset } from "./dictionary-contract";

const lookupLibraryStorageKey = "svenska.lookup-library";
// A library written before the app kept words holds bare headwords. The app
// bundle reads this by hand rather than carry a schema library for it.
function libraryWordOf(value: unknown): Partial<LibraryWord> {
  if (typeof value === "string") {
    return { headword: value, word: "" };
  }

  const { headword, word, addedAt } = (value ?? {}) as Partial<LibraryWord>;
  return { headword, word, ...(Number.isSafeInteger(addedAt) && (addedAt ?? 0) > 0 ? { addedAt } : {}) };
}

// Reading `localStorage` itself throws where site data is blocked, so it is
// only touched inside the guard.
export function readLookupLibrary(): readonly LibraryWord[] {
  try {
    const storedLibrary: unknown = JSON.parse(localStorage.getItem(lookupLibraryStorageKey) ?? "[]");
    const libraryWords = Array.isArray(storedLibrary) ? storedLibrary.map(libraryWordOf) : [];
    // One entry the app cannot read spoils the library, as the schema did.
    return libraryWords.every((libraryWord): libraryWord is LibraryWord =>
      typeof libraryWord.headword === "string" && typeof libraryWord.word === "string") ? libraryWords : [];
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

export function addToLookupLibrary({
  libraryWords,
  openedWords,
  now = Date.now(),
}: {
  libraryWords: readonly LibraryWord[];
  openedWords: readonly LibraryWord[];
  now?: number;
}): readonly LibraryWord[] {
  const existing = new Map(libraryWords.map((word) => [wordKey(word), word]));
  const uniqueOpenedWords = uniqueWords(openedWords).map((word) =>
    existing.get(wordKey(word)) ?? { ...word, addedAt: now });
  const openedKeys = new Set(uniqueOpenedWords.map(wordKey));
  return [
    ...uniqueOpenedWords,
    ...libraryWords.filter((word) => !openedKeys.has(wordKey(word))),
  ];
}

export type LibrarySort = "added" | "frequency";

export function sortLookupLibrary({ libraryWords, entries, sort }: {
  libraryWords: readonly LibraryWord[];
  entries: DictionaryAsset["entries"] | null;
  sort: LibrarySort;
}): LibraryWord[] {
  if (sort === "added") return libraryWords.toSorted((left, right) => (right.addedAt ?? 0) - (left.addedAt ?? 0));
  const frequency = new Map(libraryWords.map((word) => [wordKey(word), Math.max(0,
    ...(entries?.[word.headword] ?? []).filter((sense) => sense.word === word.word).map((sense) => sense.frequency ?? 0),
  )]));
  return libraryWords.toSorted((left, right) =>
    (frequency.get(wordKey(right)) ?? 0) - (frequency.get(wordKey(left)) ?? 0) ||
    (right.addedAt ?? 0) - (left.addedAt ?? 0));
}
