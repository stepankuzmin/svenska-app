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
};

export type LookupChoice = {
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

function russianMatchRank({ translation, query }: { translation: string; query: string }): number | null {
  if (translation === query) {
    return 4;
  }
  if (containsWholeQuery({ text: translation, query })) {
    return 5;
  }
  if (translation.startsWith(query)) {
    return 6;
  }
  return translation.includes(query) ? 7 : null;
}

export function createSearch({ dictionary }: { dictionary: DictionaryAsset }): (query: string) => LookupOutcome {
  const formsByHeadword = new Map<string, string[]>();
  for (const [form, headwords] of Object.entries(dictionary.swedishIndex)) {
    for (const headword of headwords) {
      const forms = formsByHeadword.get(headword) ?? [];
      forms.push(form);
      formsByHeadword.set(headword, forms);
    }
  }

  const entries = Object.entries(dictionary.entries).map(([headword, senses]) => ({
    headword,
    normalizedHeadword: normalizeSwedishLookupText(headword),
    normalizedSwedishForms: formsByHeadword.get(headword) ?? [],
    normalizedTranslations: senses.map((sense) => normalizeLookupText(sense.translation)),
    senses,
  }));
  const entriesByHeadword = new Map(entries.map((entry) => [entry.headword, entry]));

  return (query) => {
    const normalizedQuery = normalizeLookupText(query);
    const normalizedSwedishQuery = normalizeSwedishLookupText(query);
    const exactSwedishEntry = entries.find(
      ({ normalizedHeadword }) => normalizedHeadword === normalizedSwedishQuery,
    );
    const exactIndexedEntries = (dictionary.swedishIndex[normalizedSwedishQuery] ?? []).flatMap(
      (headword) => {
        const entry = entriesByHeadword.get(headword);
        return entry === undefined || entry === exactSwedishEntry ? [] : [entry];
      },
    );
    const exactSwedishEntries = exactSwedishEntry === undefined
      ? exactIndexedEntries
      : [exactSwedishEntry, ...exactIndexedEntries];
    const russianHeadwords = dictionary.russianIndex[normalizedQuery] ?? [];
    const exactRussianEntries = russianHeadwords.flatMap((headword) => {
      const entry = entriesByHeadword.get(headword);
      return entry === undefined ? [] : [entry];
    });

    const resultEntry = exactSwedishEntries.length === 1 ? exactSwedishEntries[0] : undefined;
    if (resultEntry !== undefined) {
      return { kind: "result", headword: resultEntry.headword, senses: resultEntry.senses };
    }

    if (exactSwedishEntries.length > 1) {
      return {
        kind: "choices",
        choices: exactSwedishEntries.map(({ headword, senses }) => ({
          headword,
          translation: senses[0]?.translation ?? "",
        })),
      };
    }

    if (normalizedQuery.length === 0) {
      return { kind: "no-match" };
    }

    const rankedChoices: Array<{ choice: LookupChoice; rank: number }> = [];
    for (const {
      headword,
      normalizedHeadword,
      normalizedSwedishForms,
      normalizedTranslations,
      senses,
    } of entries) {
      const matchingSwedishForm = normalizedSwedishQuery.length === 0
        ? undefined
        : normalizedSwedishForms.find((form) => form.includes(normalizedSwedishQuery));
      let matchingTranslation: LookupChoice | undefined;
      let matchingTranslationRank: number | null = null;
      for (const [index, translation] of normalizedTranslations.entries()) {
        const rank = russianMatchRank({ translation, query: normalizedQuery });
        if (rank !== null && (matchingTranslationRank === null || rank < matchingTranslationRank)) {
          matchingTranslation = { headword, translation: senses[index].translation };
          matchingTranslationRank = rank;
        }
      }
      if (matchingSwedishForm !== undefined) {
        const isHeadwordMatch = normalizedHeadword.includes(normalizedSwedishQuery);
        const startsWithQuery = matchingSwedishForm.startsWith(normalizedSwedishQuery);
        rankedChoices.push({
          choice: {
            headword,
            translation: senses[0]?.translation ?? "",
          },
          rank: startsWithQuery ? (isHeadwordMatch ? 0 : 1) : (isHeadwordMatch ? 2 : 3),
        });
      } else if (matchingTranslation !== undefined && matchingTranslationRank !== null) {
        rankedChoices.push({
          choice: matchingTranslation,
          rank: matchingTranslationRank,
        });
      }
    }

    if (exactRussianEntries.length === 1 && rankedChoices.length === 1) {
      const [exactRussianEntry] = exactRussianEntries;
      return {
        kind: "result",
        headword: exactRussianEntry.headword,
        senses: exactRussianEntry.senses,
      };
    }

    rankedChoices.sort((left, right) => left.rank - right.rank);
    const choices = rankedChoices.map(({ choice }) => choice);
    return choices.length === 0 ? { kind: "no-match" } : { kind: "choices", choices };
  };
}

export function isDictionaryAsset(value: unknown): value is DictionaryAsset {
  return dictionaryAssetSchema.safeParse(value).success;
}

export function isDictionaryDetailsAsset(value: unknown): value is DictionaryDetailsAsset {
  return dictionaryDetailsAssetSchema.safeParse(value).success;
}
