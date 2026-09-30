import {
  dictionaryMetadataSchema,
  type DictionaryAsset,
  type DictionaryDetailsAsset,
} from "./dictionary-contract";
import { cleanLexinText, normalizeLookupText, normalizeSwedishLookupText } from "./normalize-lookup-text";
import { wordKey, wordsOf, type LibraryWord } from "./words";

type LookupResult = {
  kind: "result";
  headword: string;
  senses: readonly DictionaryAsset["entries"][string][number][];
  suggestions: readonly LookupChoice[];
};

// A suggestion opens one word, and a word — one meaning of one word type, as
// Lexin numbers it — is offered once however many of its forms or translations
// match: `fast` the adjective stands for `fasta` too, beside `fast` the
// conjunction. `displayWord` is the best match, the headword for a Swedish one
// and the translation for a Russian one, and `exact` tells whether the query
// spells it in full.
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

// The autocomplete offers every choice an outcome holds, beside an exact
// result as well as in place of one.
export function choicesOf(outcome: LookupOutcome | null): readonly LookupChoice[] {
  if (outcome === null || outcome.kind === "no-match") {
    return [];
  }

  return outcome.kind === "result" ? outcome.suggestions : outcome.choices;
}

const wordCharacter = /[\p{L}\p{N}]/u;

function isWordCharacter(value: string | undefined): boolean {
  return value !== undefined && wordCharacter.test(value);
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

function indexEntries({
  index,
  byKey,
  normalize,
}: {
  index: Record<string, string[]>;
  byKey: ReadonlyMap<string, readonly LibraryWord[]>;
  normalize: (value: string) => string;
}): IndexEntry[] {
  return Object.entries(index).map(([displayWord, keys]) => ({
    displayWord,
    normalizedDisplayWord: normalize(displayWord),
    words: indexedWords(keys, byKey),
  }));
}

// A verb is named by its infinitive, `att vänja`, so a Swedish query that
// begins with the infinitive marker also looks the rest up among verbs.
const infinitiveMarker = /^att\s+(?=\S)/u;

function isVerb({ headword, word }: LibraryWord, entries: DictionaryAsset["entries"]): boolean {
  return entries[headword].some((sense) => sense.word === word && sense.partOfSpeech === "verb");
}

// Lexin mostly indexes only the verb of a phrase such as `aktar sig`, so each
// form it indexes alone also stands for that phrase with the rest of its
// headword: `akta sig`, `aktade sig`.
function verbPhraseEntries({
  entries,
  dictionaryEntries,
}: {
  entries: readonly IndexEntry[];
  dictionaryEntries: DictionaryAsset["entries"];
}): IndexEntry[] {
  const phraseEntries: IndexEntry[] = [];
  for (const { displayWord, words } of entries) {
    for (const word of words) {
      const headword = cleanLexinText(word.headword);
      const rest = headword.slice(headword.indexOf(" "));
      if (!headword.includes(" ") || displayWord.endsWith(rest) || !isVerb(word, dictionaryEntries)) {
        continue;
      }

      const phrase = `${displayWord}${rest}`;
      phraseEntries.push({
        displayWord: phrase,
        normalizedDisplayWord: normalizeSwedishLookupText(phrase),
        words: [word],
      });
    }
  }
  return phraseEntries;
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
  const byKey = wordsByIndexKey(dictionary.entries);
  const indexedSwedishEntries = indexEntries({
    index: dictionary.swedishIndex,
    byKey,
    normalize: normalizeSwedishLookupText,
  });
  const swedishIndexEntries = [
    ...indexedSwedishEntries,
    ...verbPhraseEntries({ entries: indexedSwedishEntries, dictionaryEntries: dictionary.entries }),
  ];
  const swedishHeadwordsByForm = headwordsByForm(swedishIndexEntries);
  const russianIndexEntries = indexEntries({
    index: dictionary.russianIndex,
    byKey,
    normalize: normalizeLookupText,
  });
  const russianHeadwordsByForm = headwordsByForm(russianIndexEntries);

  return (query) => {
    const normalizedQuery = normalizeLookupText(query);
    if (normalizedQuery.length === 0) {
      return { kind: "no-match" };
    }

    const normalizedSwedishQuery = normalizeSwedishLookupText(query);
    const rankedChoices = new Map<string, { choice: LookupChoice; rank: number }>();
    function offer(choice: Omit<LookupChoice, "exact">, rank: number) {
      const key = wordKey(choice.word);
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

    const verbQuery = infinitiveMarker.test(normalizedSwedishQuery)
      ? normalizedSwedishQuery.replace(infinitiveMarker, "")
      : null;
    const swedishQueries = [
      { query: normalizedSwedishQuery, verbsOnly: false },
      ...(verbQuery === null ? [] : [{ query: verbQuery, verbsOnly: true }]),
    ];
    for (const { normalizedDisplayWord, words } of swedishIndexEntries) {
      for (const { query: swedishQuery, verbsOnly } of swedishQueries) {
        if (swedishQuery.length === 0 || !normalizedDisplayWord.includes(swedishQuery)) {
          continue;
        }

        const rank = normalizedDisplayWord === swedishQuery
          ? 0
          : normalizedDisplayWord.startsWith(swedishQuery)
            ? 1
            : 2;
        for (const word of words) {
          if (!verbsOnly || isVerb(word, dictionary.entries)) {
            offer({ displayWord: cleanLexinText(word.headword), word, language: "sv" }, rank);
          }
        }
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

    const verbHeadwords = verbQuery === null
      ? []
      : (swedishHeadwordsByForm.get(verbQuery) ?? []).filter((headword) =>
          dictionary.entries[headword].some((sense) => sense.partOfSpeech === "verb"));
    const swedishHeadwords = swedishHeadwordsByForm.get(normalizedSwedishQuery) ?? verbHeadwords;
    const russianHeadwords = russianHeadwordsByForm.get(normalizedQuery) ?? [];
    const resultHeadword = swedishHeadwords.length === 1
      ? swedishHeadwords[0]
      : russianHeadwords.length === 1 && choices.length === 1
        ? russianHeadwords[0]
        : undefined;
    if (resultHeadword !== undefined) {
      return {
        kind: "result",
        headword: resultHeadword,
        senses: dictionary.entries[resultHeadword],
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
