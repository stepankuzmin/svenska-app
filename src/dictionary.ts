import {
  dictionaryMetadataSchema,
  type DictionaryAsset,
  type DictionaryDetailsAsset,
} from "./dictionary-contract";
import { normalizeLookupText } from "./normalize-lookup-text";
import { wordKey, wordsOf, type LibraryWord } from "./words";

type LookupResult = {
  kind: "result";
  headword: string;
  senses: readonly DictionaryAsset["entries"][string][number][];
  suggestions: readonly LookupChoice[];
};

// A suggestion opens one word, and a word — one meaning of one word type, as
// Lexin numbers it — is offered once however many of its forms match: `fast`
// the adjective stands for `fasta` too, beside `fast` the conjunction. A Swedish
// suggestion reads as its headword, a Russian one as its best matching
// translation, and `exact` tells whether the query spells a form in full.
export type LookupChoice = {
  displayWord: string;
  word: LibraryWord;
  language: "ru" | "sv";
  exact: boolean;
};

export type LookupOutcome =
  | LookupResult
  | { kind: "choices"; choices: readonly LookupChoice[] }
  | { kind: "no-match" };

function normalizeSwedishLookupText(value: string): string {
  return normalizeLookupText(value.replaceAll("|", ""));
}

function isWordCharacter(value: string | undefined): boolean {
  return value !== undefined && /[\p{L}\p{N}]/u.test(value);
}

function containsWholeQuery({ text, query }: { text: string; query: string }): boolean {
  let matchIndex = text.indexOf(query);
  while (matchIndex !== -1) {
    const before = text[matchIndex - 1];
    const after = text[matchIndex + query.length];
    if (!isWordCharacter(before) && !isWordCharacter(after)) {
      return true;
    }
    matchIndex = text.indexOf(query, matchIndex + 1);
  }
  return false;
}

function russianMatchRank({ text, query }: { text: string; query: string }): number | null {
  if (text === query) {
    return 0;
  }
  if (containsWholeQuery({ text, query })) {
    return 1;
  }
  if (text.startsWith(query)) {
    return 2;
  }
  return text.includes(query) ? 3 : null;
}

type IndexEntry = {
  displayWord: string;
  normalizedDisplayWord: string;
  words: readonly LibraryWord[];
};

// An index names a word by its Lexin number, or by its spelling and number
// where Lexin gives one number to two spellings.
function wordsByIndexKey(entries: DictionaryAsset["entries"]): Map<string, LibraryWord[]> {
  const byKey = new Map<string, LibraryWord[]>();
  for (const [headword, senses] of Object.entries(entries)) {
    for (const { word } of wordsOf({ headword, senses })) {
      const libraryWord = { headword, word };
      byKey.set(word, [...(byKey.get(word) ?? []), libraryWord]);
      byKey.set(wordKey(libraryWord), [libraryWord]);
    }
  }
  return byKey;
}

function indexedWords(
  keys: readonly string[],
  byKey: ReadonlyMap<string, readonly LibraryWord[]>,
): LibraryWord[] {
  const words = new Map<string, LibraryWord>();
  for (const libraryWord of keys.flatMap((key) => byKey.get(key) ?? [])) {
    words.set(wordKey(libraryWord), libraryWord);
  }
  return [...words.values()];
}

function indexEntries(
  index: Record<string, string[]>,
  byKey: ReadonlyMap<string, readonly LibraryWord[]>,
  normalize: (value: string) => string,
): IndexEntry[] {
  return Object.entries(index).map(([displayWord, keys]) => ({
    displayWord,
    normalizedDisplayWord: normalize(displayWord),
    words: indexedWords(keys, byKey),
  }));
}

// Two display words can normalise to the same form, so their headwords merge
// into one bucket rather than the later one replacing the earlier.
function headwordsByForm(entries: readonly IndexEntry[]): Map<string, string[]> {
  const byForm = new Map<string, string[]>();
  for (const { normalizedDisplayWord, words } of entries) {
    const bucket = byForm.get(normalizedDisplayWord) ?? [];
    for (const { headword } of words) {
      if (!bucket.includes(headword)) {
        bucket.push(headword);
      }
    }
    byForm.set(normalizedDisplayWord, bucket);
  }
  return byForm;
}

export function createSearch({ dictionary }: { dictionary: DictionaryAsset }): (query: string) => LookupOutcome {
  const entries = Object.entries(dictionary.entries).map(([headword, senses]) => ({
    headword,
    normalizedHeadword: normalizeSwedishLookupText(headword),
    senses,
  }));
  const entriesByHeadword = new Map(entries.map((entry) => [entry.headword, entry]));
  const byKey = wordsByIndexKey(dictionary.entries);
  const swedishIndexEntries = indexEntries(dictionary.swedishIndex, byKey, normalizeSwedishLookupText);
  const swedishHeadwordsByForm = headwordsByForm(swedishIndexEntries);
  const russianIndexEntries = indexEntries(dictionary.russianIndex, byKey, normalizeLookupText);
  const russianHeadwordsByForm = headwordsByForm(russianIndexEntries);

  return (query) => {
    const normalizedQuery = normalizeLookupText(query);
    if (normalizedQuery.length === 0) {
      return { kind: "no-match" };
    }

    const normalizedSwedishQuery = normalizeSwedishLookupText(query);
    const exactSwedishEntry = entries.find(
      ({ normalizedHeadword }) => normalizedHeadword === normalizedSwedishQuery,
    );
    const indexedHeadwords = swedishHeadwordsByForm.get(normalizedSwedishQuery) ?? [];
    const exactIndexedEntries = indexedHeadwords.flatMap(
      (headword) => {
        const entry = entriesByHeadword.get(headword);
        return entry === undefined || entry === exactSwedishEntry ? [] : [entry];
      },
    );
    const exactSwedishEntries = exactSwedishEntry === undefined
      ? exactIndexedEntries
      : [exactSwedishEntry, ...exactIndexedEntries];
    const russianHeadwords = russianHeadwordsByForm.get(normalizedQuery) ?? [];
    const exactRussianEntries = russianHeadwords.flatMap((headword) => {
      const entry = entriesByHeadword.get(headword);
      return entry === undefined ? [] : [entry];
    });

    const rankedChoices = new Map<string, { choice: LookupChoice; rank: number }>();
    function offer(choice: Omit<LookupChoice, "exact">, rank: number) {
      const key = `${choice.language}:${wordKey(choice.word)}`;
      const offered = rankedChoices.get(key);
      if (offered === undefined || rank < offered.rank ||
        (rank === offered.rank && choice.displayWord.length < offered.choice.displayWord.length)) {
        rankedChoices.set(key, { choice: { ...choice, exact: rank === 0 }, rank });
      }
    }

    for (const { displayWord, normalizedDisplayWord, words } of russianIndexEntries) {
      const rank = russianMatchRank({ text: normalizedDisplayWord, query: normalizedQuery });
      if (rank === null) {
        continue;
      }

      for (const word of words) {
        offer({ displayWord, word, language: "ru" }, rank);
      }
    }

    for (const { normalizedDisplayWord, words } of swedishIndexEntries) {
      if (
        normalizedSwedishQuery.length === 0 ||
        !normalizedDisplayWord.includes(normalizedSwedishQuery)
      ) {
        continue;
      }

      const rank = normalizedDisplayWord === normalizedSwedishQuery
        ? 0
        : normalizedDisplayWord.startsWith(normalizedSwedishQuery)
          ? 1
          : 2;
      for (const word of words) {
        offer({ displayWord: word.headword.replaceAll("|", ""), word, language: "sv" }, rank);
      }
    }

    const sortedChoices = [...rankedChoices.values()].sort((left, right) => {
      const rankDifference = left.rank - right.rank;
      if (rankDifference !== 0) {
        return rankDifference;
      }

      const lengthDifference = left.choice.displayWord.length - right.choice.displayWord.length;
      return lengthDifference !== 0
        ? lengthDifference
        : left.choice.displayWord.localeCompare(
            right.choice.displayWord,
            left.choice.language,
          );
    });
    const choices = sortedChoices.map(({ choice }) => choice);

    const resultEntry = exactSwedishEntries.length === 1 ? exactSwedishEntries[0] : undefined;
    if (resultEntry !== undefined) {
      return {
        kind: "result",
        headword: resultEntry.headword,
        senses: resultEntry.senses,
        suggestions: choices,
      };
    }

    if (exactRussianEntries.length === 1 && choices.length === 1) {
      const [exactRussianEntry] = exactRussianEntries;
      return {
        kind: "result",
        headword: exactRussianEntry.headword,
        senses: exactRussianEntry.senses,
        suggestions: choices,
      };
    }

    return choices.length === 0 ? { kind: "no-match" } : { kind: "choices", choices };
  };
}

function looksLikeRecordOfArrays(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  // Samples the first key rather than listing 64k of them on the startup path.
  for (const key in value) {
    return Array.isArray((value as Record<string, unknown>)[key]);
  }

  return true;
}

// The release script deep-parses these exact bytes and the asset filename is
// their content digest, so startup only confirms the file is the right shape.
export function hasDictionaryAssetShape(value: unknown): value is DictionaryAsset {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const asset = value as Partial<DictionaryAsset>;
  return (
    dictionaryMetadataSchema.safeParse(asset.metadata).success &&
    looksLikeRecordOfArrays(asset.entries) &&
    looksLikeRecordOfArrays(asset.swedishIndex) &&
    looksLikeRecordOfArrays(asset.russianIndex)
  );
}

export function hasDictionaryDetailsShape(value: unknown): value is DictionaryDetailsAsset {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const asset = value as Partial<DictionaryDetailsAsset>;
  return typeof asset.sourceEditionDate === "string" && looksLikeRecordOfArrays(asset.entries);
}
