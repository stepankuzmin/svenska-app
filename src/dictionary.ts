import type { DictionaryAsset } from "./dictionary-contract";
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

export { hasDictionaryAssetShape, hasDictionaryDetailsShape } from "./dictionary-validation";
