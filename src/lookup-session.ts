import { choicesOf, type LookupChoice, type LookupOutcome } from "./dictionary";
import type { DictionaryAsset } from "./dictionary-contract";
import { addToLookupLibrary } from "./lookup-library";
import { wordCards } from "./word-cards";
import { resolveLibraryWords, uniqueWords, wordKey, wordsOf, type LibraryWord } from "./words";

// What a lookup leaves behind: the field, the lookup library, and the one word
// card extended. `opens` counts the lookups that opened words, so the screen
// can tell that the autocomplete is settled even when the same card opens twice.
export type LookupSession = {
  query: string;
  libraryWords: readonly LibraryWord[];
  expandedCard: string | null;
  opens: number;
  pastedList: readonly PastedLine[] | null;
};

export type PastedLine = { line: string; words: readonly LibraryWord[] };

const lineBreak = /\r?\n/u;
const listMarker = /^\s*(?:[-*+]|\d+[.)])\s+/u;
const emptyGloss = /\s+-\s*$/u;
const gloss = /\s-\s/u;

export type LookupSessionEvent =
  | { kind: "query-changed"; query: string }
  | { kind: "dictionary-loaded"; dictionary: Pick<DictionaryAsset, "entries" | "wordAliases"> }
  | { kind: "submitted"; outcome: LookupOutcome | null }
  | { kind: "picked"; choice: Pick<LookupChoice, "word"> }
  | { kind: "deep-linked"; outcome: LookupOutcome }
  | { kind: "pasted"; pastedList: readonly PastedLine[] }
  | { kind: "card-toggled"; card: string }
  | { kind: "word-removed"; card: string };

// A lookup opens the words it names and extends one card: the first of the
// headword it names, or the one a pick names. Editing the field closes the
// card.
function open(
  session: LookupSession,
  words: readonly LibraryWord[],
  card: string | null,
  query: string,
): LookupSession {
  return {
    query,
    libraryWords: addToLookupLibrary({ libraryWords: session.libraryWords, openedWords: words }),
    expandedCard: card,
    opens: session.opens + 1,
    pastedList: null,
  };
}

function exactWordsOf(outcome: LookupOutcome | null, anyLanguage: boolean): LibraryWord[] {
  if (outcome?.kind === "result") {
    return wordsOf({ headword: outcome.headword, senses: outcome.senses }).map(({ headword, word }) => ({ headword, word }));
  }
  return outcome?.kind === "choices" ? outcome.choices
    .filter((choice) => choice.exact && (anyLanguage || choice.language === "sv"))
    .map(({ word }) => word) : [];
}

function spelledWordsOf(outcome: LookupOutcome): LibraryWord[] {
  const spellsSwedishForm = choicesOf(outcome).some((choice) =>
    choice.exact && choice.language === "sv" && choice.related !== true);
  return spellsSwedishForm ? exactWordsOf(outcome, false) : [];
}

export function isList(text: string): boolean {
  return text.trim().includes("\n");
}

export function termsOf(line: string): string[] {
  const terms = line.replace(listMarker, "").replace(emptyGloss, "");
  return gloss.test(terms) ? [] : terms.split("=").map((term) => term.trim()).filter((term) => term.length > 0);
}

export function pastedLinesOf(text: string, search: (query: string) => LookupOutcome): PastedLine[] {
  return text.split(lineBreak).map((line) => ({
    line,
    words: uniqueWords(termsOf(line).flatMap((term) => spelledWordsOf(search(term)))),
  }));
}

export function pastedListText({
  pastedList,
  entries,
}: {
  pastedList: readonly PastedLine[];
  entries: DictionaryAsset["entries"];
}): string {
  return pastedList.map(({ line, words }) => {
    const translations = [...new Set(wordCards({ libraryWords: words, entries, details: null })
      .flatMap((card) => card.senses.map((sense) => sense.translation))
      .filter((translation) => translation.length > 0))];
    return translations.length === 0 ? line : `${line.replace(emptyGloss, "").trimEnd()} - ${translations.join(", ")}`;
  }).join("\n");
}

export function wordsOpenedBy(event: LookupSessionEvent): LibraryWord[] {
  if (event.kind === "picked") return [event.choice.word];
  if (event.kind === "submitted") return exactWordsOf(event.outcome, false);
  if (event.kind === "deep-linked") return exactWordsOf(event.outcome, true);
  if (event.kind === "pasted") return uniqueWords(event.pastedList.flatMap(({ words }) => words));
  return [];
}

export function reduceLookupSession({
  session,
  event,
}: {
  session: LookupSession;
  event: LookupSessionEvent;
}): LookupSession {
  switch (event.kind) {
    case "query-changed":
      return { ...session, query: event.query, expandedCard: null, pastedList: null };
    case "dictionary-loaded": {
      const libraryWords = resolveLibraryWords({ libraryWords: session.libraryWords, dictionary: event.dictionary });
      return libraryWords === session.libraryWords ? session : { ...session, libraryWords };
    }
    case "submitted":
    case "deep-linked": {
      // The field empties on submit and stays as it was on a deep link.
      const query = event.kind === "submitted" ? "" : session.query;
      const words = wordsOpenedBy(event);
      return words.length === 0
        ? session
        : open(session, words, wordKey(words[0]), query);
    }
    case "pasted": {
      const words = wordsOpenedBy(event);
      const opened = words.length === 0 ? session : open(session, words, wordKey(words[0]), "");
      return { ...opened, pastedList: event.pastedList };
    }
    case "picked":
      return open(session, [event.choice.word], wordKey(event.choice.word), "");
    case "card-toggled":
      return { ...session, expandedCard: session.expandedCard === event.card ? null : event.card };
    case "word-removed":
      return {
        ...session,
        libraryWords: session.libraryWords.filter((libraryWord) => wordKey(libraryWord) !== event.card),
      };
  }
}
