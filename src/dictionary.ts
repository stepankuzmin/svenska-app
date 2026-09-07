import { dictionaryAssetSchema, type DictionaryAsset } from "./dictionary-contract";

export type LookupResult = {
  headword: string;
  senses: readonly {
    partOfSpeech: string;
    meaning: string;
    translation: string;
  }[];
};

export function createSearch({ dictionary }: { dictionary: DictionaryAsset }): (query: string) => LookupResult | null {
  return (query) => {
    const senses = dictionary.entries[query];

    return senses === undefined ? null : { headword: query, senses };
  };
}

export function isDictionaryAsset(value: unknown): value is DictionaryAsset {
  return dictionaryAssetSchema.safeParse(value).success;
}
