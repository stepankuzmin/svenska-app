import type { DictionaryAsset, DictionaryDetailsAsset } from "./dictionary-contract";
import type { LibraryWord } from "./words";

export const citedQuery = /^(att|har|en|ett)\s+(\S.*)$/u;

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
    looksLikeRecordOfArrays(asset.russianIndex) &&
    looksLikeRecordOfArrays(asset.relatedIndex)
  );
}

export function hasDictionaryDetailsShape(value: unknown): value is DictionaryDetailsAsset {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const asset = value as Partial<DictionaryDetailsAsset>;
  return typeof asset.sourceEditionDate === "string" && looksLikeRecordOfArrays(asset.entries);
}
