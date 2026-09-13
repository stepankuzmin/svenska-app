import {
  dictionaryAssetSchema,
  dictionaryDetailsAssetSchema,
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
  headword: string;
  translation: string;
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
  const swedishIndexEntries = Object.entries(dictionary.swedishIndex);
  const russianIndexEntries = Object.entries(dictionary.russianIndex);

  return (query) => {
    const normalizedQuery = normalizeLookupText(query);
    const normalizedSwedishQuery = normalizeSwedishLookupText(query);
    const exactSwedishEntry = entries.find(
      ({ normalizedHeadword }) => normalizedHeadword === normalizedSwedishQuery,
    );
    const indexedHeadwords = Object.hasOwn(dictionary.swedishIndex, normalizedSwedishQuery)
      ? dictionary.swedishIndex[normalizedSwedishQuery]
      : [];
    const exactIndexedEntries = indexedHeadwords.flatMap(
      (headword) => {
        const entry = entriesByHeadword.get(headword);
        return entry === undefined || entry === exactSwedishEntry ? [] : [entry];
      },
    );
    const exactSwedishEntries = exactSwedishEntry === undefined
      ? exactIndexedEntries
      : [exactSwedishEntry, ...exactIndexedEntries];
    const russianHeadwords = Object.hasOwn(dictionary.russianIndex, normalizedQuery)
      ? dictionary.russianIndex[normalizedQuery]
      : [];
    const exactRussianEntries = russianHeadwords.flatMap((headword) => {
      const entry = entriesByHeadword.get(headword);
      return entry === undefined ? [] : [entry];
    });

    if (normalizedQuery.length === 0) {
      return { kind: "no-match" };
    }

    const isRussianQuery = /\p{Script=Cyrillic}/u.test(normalizedQuery);
    const rankedChoices: Array<{ choice: LookupChoice; rank: number }> = [];
    if (isRussianQuery) {
      for (const [displayWord, headwords] of russianIndexEntries) {
        const rank = russianMatchRank({ text: displayWord, query: normalizedQuery });
        const headword = headwords[0];
        if (rank !== null && headword !== undefined && entriesByHeadword.has(headword)) {
          rankedChoices.push({
            choice: { displayWord, headword, translation: displayWord },
            rank,
          });
        }
      }
    } else {
      for (const [displayWord, headwords] of swedishIndexEntries) {
        if (
          normalizedSwedishQuery.length === 0 ||
          !displayWord.includes(normalizedSwedishQuery)
        ) {
          continue;
        }

        const rank = displayWord === normalizedSwedishQuery
          ? 0
          : displayWord.startsWith(normalizedSwedishQuery)
            ? 1
            : 2;
        const headword = headwords.find(
          (candidate) => normalizeSwedishLookupText(candidate) === displayWord,
        ) ?? headwords[0];
        const entry = headword === undefined ? undefined : entriesByHeadword.get(headword);
        if (entry === undefined) {
          continue;
        }

        rankedChoices.push({
          choice: {
            displayWord,
            headword,
            translation: entry.senses[0]?.translation ?? "",
          },
          rank,
        });
      }
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
            isRussianQuery ? "ru" : "sv",
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

export function isDictionaryDetailsAsset(value: unknown): value is DictionaryDetailsAsset {
  return dictionaryDetailsAssetSchema.safeParse(value).success;
}
