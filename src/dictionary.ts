import { dictionaryAssetSchema, type DictionaryAsset } from "./dictionary-contract";

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

const maximumChoices = 8;

function normalizeLookupText(value: string): string {
  return value.trim().toLocaleLowerCase("sv-SE");
}

export function createSearch({ dictionary }: { dictionary: DictionaryAsset }): (query: string) => LookupOutcome {
  const entries = Object.entries(dictionary.entries).map(([headword, senses]) => ({
    headword,
    normalizedHeadword: normalizeLookupText(headword),
    senses,
  }));

  return (query) => {
    const normalizedQuery = normalizeLookupText(query);
    const exactEntry = entries.find(({ normalizedHeadword }) => normalizedHeadword === normalizedQuery);

    if (exactEntry !== undefined) {
      return { kind: "result", headword: exactEntry.headword, senses: exactEntry.senses };
    }

    if (normalizedQuery.length === 0) {
      return { kind: "no-match" };
    }

    const choices: LookupChoice[] = [];
    for (const { headword, normalizedHeadword, senses } of entries) {
      const matchingTranslation = senses.find((sense) =>
        normalizeLookupText(sense.translation).startsWith(normalizedQuery),
      );
      const displayedSense = matchingTranslation ?? (normalizedHeadword.startsWith(normalizedQuery) ? senses[0] : undefined);

      if (displayedSense !== undefined) {
        choices.push({ headword, translation: displayedSense.translation });
      }
      if (choices.length === maximumChoices) {
        break;
      }
    }

    return choices.length === 0 ? { kind: "no-match" } : { kind: "choices", choices };
  };
}

export function isDictionaryAsset(value: unknown): value is DictionaryAsset {
  return dictionaryAssetSchema.safeParse(value).success;
}
