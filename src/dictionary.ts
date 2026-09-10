import { dictionaryAssetSchema, type DictionaryAsset } from "./dictionary-contract";
import { normalizeLookupText } from "./normalize-lookup-text";

export type LookupResult = {
  kind: "result";
  headword: string;
  senses: readonly {
    partOfSpeech: string;
    meaning: string;
    translation: string;
  }[];
};

export type LookupChoice = {
  headword: string;
  translation: string;
};

export type LookupOutcome =
  | LookupResult
  | { kind: "choices"; choices: readonly LookupChoice[] }
  | { kind: "no-match" };

export function createSearch({ dictionary }: { dictionary: DictionaryAsset }): (query: string) => LookupOutcome {
  const entries = Object.entries(dictionary.entries).map(([headword, senses]) => ({
    headword,
    normalizedHeadword: normalizeLookupText(headword),
    senses,
  }));
  const entriesByHeadword = new Map(entries.map((entry) => [entry.headword, entry]));

  return (query) => {
    const normalizedQuery = normalizeLookupText(query);
    const exactSwedishEntry = entries.find(({ normalizedHeadword }) => normalizedHeadword === normalizedQuery);
    const russianHeadwords = dictionary.russianIndex[normalizedQuery] ?? [];
    const exactRussianEntries = russianHeadwords.flatMap((headword) => {
      const entry = entriesByHeadword.get(headword);
      return entry === undefined ? [] : [entry];
    });

    const resultEntry = exactSwedishEntry ?? (exactRussianEntries.length === 1 ? exactRussianEntries[0] : undefined);
    if (resultEntry !== undefined) {
      return { kind: "result", headword: resultEntry.headword, senses: resultEntry.senses };
    }

    if (exactRussianEntries.length > 1) {
      return {
        kind: "choices",
        choices: exactRussianEntries.map(({ headword, senses }) => ({
          headword,
          translation:
            senses.find((sense) => normalizeLookupText(sense.translation) === normalizedQuery)?.translation ?? "",
        })),
      };
    }

    if (normalizedQuery.length === 0) {
      return { kind: "no-match" };
    }

    const choices: LookupChoice[] = [];
    for (const { headword, normalizedHeadword, senses } of entries) {
      const matchingTranslation = senses.find((sense) =>
        normalizeLookupText(sense.translation).includes(normalizedQuery),
      );
      const displayedSense = matchingTranslation ?? (normalizedHeadword.includes(normalizedQuery) ? senses[0] : undefined);

      if (displayedSense !== undefined) {
        choices.push({ headword, translation: displayedSense.translation });
      }
    }

    return choices.length === 0 ? { kind: "no-match" } : { kind: "choices", choices };
  };
}

export function isDictionaryAsset(value: unknown): value is DictionaryAsset {
  return dictionaryAssetSchema.safeParse(value).success;
}
