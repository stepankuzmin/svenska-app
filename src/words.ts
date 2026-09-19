import type { DictionaryAsset } from "./dictionary-contract";

// A spelling can hold more than one word: `en val` the whale and `ett val` the
// election. Lexin numbers them, and every sense carries the number of the word
// it belongs to, so a lookup library keeps words rather than spellings.
export type LibraryWord = {
  headword: string;
  word: string;
};

export type HeadwordWord = LibraryWord & {
  senseIndexes: number[];
};

export function wordKey({ headword, word }: LibraryWord): string {
  return word.length > 0 ? `${headword}#${word}` : headword;
}

export function wordsOf({
  headword,
  senses,
}: {
  headword: string;
  senses: readonly { word: string }[];
}): HeadwordWord[] {
  const words: HeadwordWord[] = [];

  senses.forEach((sense, index) => {
    const existing = words.find((item) => item.word === sense.word);
    if (existing === undefined) {
      words.push({ headword, word: sense.word, senseIndexes: [index] });
      return;
    }

    existing.senseIndexes.push(index);
  });

  return words;
}

function uniqueWords(libraryWords: readonly LibraryWord[]): LibraryWord[] {
  const byKey = new Map(libraryWords.map((libraryWord) => [wordKey(libraryWord), libraryWord]));
  return [...byKey.values()];
}

// A library entry can name a spelling rather than one of its words, either
// because an earlier release stored it that way or because a later dictionary
// numbers that spelling differently. The dictionary settles it: a name it no
// longer knows as a word opens every word the spelling holds.
export function resolveLibraryWords({
  libraryWords,
  entries,
}: {
  libraryWords: readonly LibraryWord[];
  entries: DictionaryAsset["entries"];
}): readonly LibraryWord[] {
  const resolvedWords = uniqueWords(libraryWords.flatMap((libraryWord) => {
    const senses = entries[libraryWord.headword];
    if (senses === undefined || senses.some((sense) => sense.word === libraryWord.word)) {
      return [libraryWord];
    }

    return wordsOf({ headword: libraryWord.headword, senses })
      .map(({ headword, word }) => ({ headword, word }));
  }));

  // A library the dictionary leaves as it is stays the library it was, so a
  // visit that resolves nothing rewrites nothing.
  const unchanged = resolvedWords.length === libraryWords.length &&
    resolvedWords.every((libraryWord, index) => libraryWord === libraryWords[index]);
  return unchanged ? libraryWords : resolvedWords;
}
