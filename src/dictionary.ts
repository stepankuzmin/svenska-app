import type { DictionaryAsset, DictionaryDetailsAsset } from "./dictionary-contract";
import { cleanLexinText, normalizeLookupText, normalizeSwedishLookupText } from "./normalize-lookup-text";
import { crossReferenceType, wordKey, wordsOf, type LibraryWord } from "./words";

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
// spells it in full. `form` is the indexed Swedish form a Swedish choice
// matched, which a suggestion shows when its forms leave it out: the
// comparative `abnormare` offers `abnorm`.
export type LookupChoice = {
  displayWord: string;
  word: LibraryWord;
  language: "ru" | "sv";
  exact: boolean;
  form?: string;
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

// A card names a verb by its infinitive, `att minska`, a noun by its article,
// `en val`, and spells the supine after `har`, so a query that opens the same
// way also looks the rest up among the words of that type.
export const citedQuery = /^(att|har|en|ett)\s+(\S.*)$/u;

export function createSearch({ dictionary }: { dictionary: DictionaryAsset }): (query: string) => LookupOutcome {
  const byKey = wordsByIndexKey(dictionary.entries);
  const swedishIndexEntries = indexEntries({
    index: dictionary.swedishIndex,
    byKey,
    normalize: normalizeSwedishLookupText,
  });
  const russianIndexEntries = indexEntries({
    index: dictionary.russianIndex,
    byKey,
    normalize: normalizeLookupText,
  });

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
        rankedChoices.set(key, { choice: { ...choice, exact: rank <= 1 }, rank });
      }
    }

    // A query that spells a headword in full ranks above one that spells
    // another of its forms: `bort` the adverb comes before `bör`, whose supine
    // `har bort` the query spells too. A spelling Lexin holds only as a cross
    // reference names no word of its own, so `borde` offers `bör` first.
    function namesWord({ headword, word }: LibraryWord, swedishQuery: string): boolean {
      return normalizeSwedishLookupText(headword) === swedishQuery &&
        dictionary.entries[headword].some((sense) =>
          sense.word === word && sense.partOfSpeech !== crossReferenceType);
    }

    for (const { displayWord, normalizedDisplayWord, words } of russianIndexEntries) {
      const rank = russianMatchRank({ text: normalizedDisplayWord, query: normalizedQuery });
      if (rank === null) {
        continue;
      }

      for (const word of words) {
        offer({ displayWord, word, language: "ru" }, rank + 1);
      }
    }

    // The query as typed still counts, so `en face` stays a word of its own.
    const [, citation, citedForm] = normalizedSwedishQuery.match(citedQuery) ?? [];
    const citedType = citation === "en" || citation === "ett" ? "subst." : "verb";
    for (const { displayWord: form, normalizedDisplayWord, words } of swedishIndexEntries) {
      for (const swedishQuery of [normalizedSwedishQuery, citedForm]) {
        if (!swedishQuery || !normalizedDisplayWord.includes(swedishQuery)) {
          continue;
        }

        const rank = normalizedDisplayWord === swedishQuery
          ? 1
          : normalizedDisplayWord.startsWith(swedishQuery)
            ? 2
            : 3;
        for (const word of words) {
          if (swedishQuery === normalizedSwedishQuery || dictionary.entries[word.headword].some((sense) =>
            sense.word === word.word && sense.partOfSpeech === citedType)) {
            offer(
              { displayWord: cleanLexinText(word.headword), word, language: "sv", form: cleanLexinText(form) },
              rank === 1 && namesWord(word, swedishQuery) ? 0 : rank,
            );
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

    // A query names a result when it spells the forms of one Swedish headword,
    // or one Russian translation that no other word shares.
    const exactHeadwords = (language: LookupChoice["language"]) => [...new Set(choices
      .filter((choice) => choice.exact && choice.language === language)
      .map(({ word }) => word.headword))];
    const swedishHeadwords = exactHeadwords("sv");
    const russianHeadwords = exactHeadwords("ru");
    const resultHeadword = swedishHeadwords.length === 1
      ? swedishHeadwords[0]
      : russianHeadwords.length === 1 && choices.length === 1
        ? russianHeadwords[0]
        : undefined;
    // A cited query opens only the words of the type it names: `en basar`
    // the market, not the verb Lexin spells alike.
    const citedWords = new Set(choices
      .filter((choice) => choice.exact && choice.word.headword === resultHeadword)
      .map(({ word }) => word.word));
    if (resultHeadword !== undefined) {
      return {
        kind: "result",
        headword: resultHeadword,
        senses: dictionary.entries[resultHeadword].filter((sense) =>
          citedForm === undefined || citedWords.has(sense.word)),
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

// The app checks the metadata by hand so the schema library stays out of its
// bundle; the build parses the whole asset with the schema.
function hasMetadataShape(value: unknown): value is DictionaryAsset["metadata"] {
  const metadata = (value ?? {}) as Partial<DictionaryAsset["metadata"]>;
  return typeof metadata.sourceEditionDate === "string" &&
    typeof metadata.attribution === "string" &&
    metadata.license === "CC BY 4.0";
}

// The release script deep-parses these exact bytes and the asset filename is
// their content digest, so startup only confirms the file is the right shape:
// resolving the library reads `wordAliases`, so it must be an object.
export function hasDictionaryAssetShape(value: unknown): value is DictionaryAsset {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const asset = value as Partial<DictionaryAsset>;
  return (
    Object(asset.wordAliases) === asset.wordAliases &&
    hasMetadataShape(asset.metadata) &&
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
