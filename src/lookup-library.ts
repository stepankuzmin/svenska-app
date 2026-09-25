import { z } from "zod";
import { wordKey, type LibraryWord } from "./words";

const lookupLibraryStorageKey = "svenska.lookup-library";
// A library written before the app kept words holds bare headwords.
const lookupLibrarySchema = z.array(z.union([
  z.object({ headword: z.string(), word: z.string() }),
  z.string().transform((headword) => ({ headword, word: "" })),
]));

// Reading `localStorage` itself throws where site data is blocked, so it is
// only touched inside the guard.
export function readLookupLibrary(): readonly LibraryWord[] {
  try {
    const storedLibrary: unknown = JSON.parse(localStorage.getItem(lookupLibraryStorageKey) ?? "[]");
    return lookupLibrarySchema.safeParse(storedLibrary).data ?? [];
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

export function removeFromLookupLibrary({
  libraryWords,
  card,
}: {
  libraryWords: readonly LibraryWord[];
  card: string;
}): readonly LibraryWord[] {
  return libraryWords.filter((libraryWord) => wordKey(libraryWord) !== card);
}
