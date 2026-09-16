import {
  dictionaryAssetSchema,
  dictionaryDetailsAssetSchema,
  dictionaryMetadataSchema,
  type DictionaryAsset,
  type DictionaryDetailsAsset,
} from "./dictionary-contract";
import { normalizeLookupText } from "./normalize-lookup-text";

type LookupResult = {
  kind: "result";
  headword: string;
  senses: readonly DictionaryAsset["entries"][string][number][];
  suggestions: readonly LookupChoice[];
};

export type LookupChoice = {
  displayWord: string;
  headwords: readonly string[];
  language: "ru" | "sv";
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

export function createSearch({ dictionary }: { dictionary: DictionaryAsset }): (query: string) => LookupOutcome {
  const entries = Object.entries(dictionary.entries).map(([headword, senses]) => ({
    headword,
    normalizedHeadword: normalizeSwedishLookupText(headword),
    senses,
  }));
  const entriesByHeadword = new Map(entries.map((entry) => [entry.headword, entry]));
  const swedishIndexEntries = Object.entries(dictionary.swedishIndex).map(
    ([displayWord, headwords]) => ({
      displayWord,
      normalizedDisplayWord: normalizeSwedishLookupText(displayWord),
      headwords,
    }),
  );
  const swedishHeadwordsByForm = new Map<string, string[]>();
  for (const { normalizedDisplayWord, headwords } of swedishIndexEntries) {
    const indexedHeadwords = swedishHeadwordsByForm.get(normalizedDisplayWord) ?? [];
    for (const headword of headwords) {
      if (!indexedHeadwords.includes(headword)) {
        indexedHeadwords.push(headword);
      }
    }
    swedishHeadwordsByForm.set(normalizedDisplayWord, indexedHeadwords);
  }
  const russianIndexEntries = Object.entries(dictionary.russianIndex).map(
    ([displayWord, headwords]) => ({
      displayWord,
      normalizedDisplayWord: normalizeLookupText(displayWord),
      headwords,
    }),
  );
  const russianHeadwordsByForm = new Map<string, string[]>();
  for (const { normalizedDisplayWord, headwords } of russianIndexEntries) {
    const indexedHeadwords = russianHeadwordsByForm.get(normalizedDisplayWord) ?? [];
    for (const headword of headwords) {
      if (!indexedHeadwords.includes(headword)) {
        indexedHeadwords.push(headword);
      }
    }
    russianHeadwordsByForm.set(normalizedDisplayWord, indexedHeadwords);
  }

  return (query) => {
    const normalizedQuery = normalizeLookupText(query);
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

    if (normalizedQuery.length === 0) {
      return { kind: "no-match" };
    }

    const rankedChoices: Array<{ choice: LookupChoice; rank: number }> = [];
    for (const { displayWord, normalizedDisplayWord, headwords: indexedHeadwords } of russianIndexEntries) {
      const rank = russianMatchRank({ text: normalizedDisplayWord, query: normalizedQuery });
      const headwords = indexedHeadwords.filter((headword) => entriesByHeadword.has(headword));
      if (rank !== null && headwords.length > 0) {
        rankedChoices.push({ choice: { displayWord, headwords, language: "ru" }, rank });
      }
    }

    for (const { displayWord, normalizedDisplayWord, headwords } of swedishIndexEntries) {
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
      const indexedSwedishHeadwords = headwords.filter((headword) => entriesByHeadword.has(headword));
      if (indexedSwedishHeadwords.length === 0) {
        continue;
      }

      rankedChoices.push({
        choice: { displayWord, headwords: indexedSwedishHeadwords, language: "sv" },
        rank,
      });
    }

    rankedChoices.sort((left, right) => {
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
    const choices = rankedChoices.map(({ choice }) => choice);

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

export function isDictionaryAsset(value: unknown): value is DictionaryAsset {
  return dictionaryAssetSchema.safeParse(value).success;
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

export function isDictionaryDetailsAsset(value: unknown): value is DictionaryDetailsAsset {
  return dictionaryDetailsAssetSchema.safeParse(value).success;
}
