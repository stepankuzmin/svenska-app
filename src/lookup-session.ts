import type { LookupChoice, LookupOutcome } from "./dictionary";
import type { DictionaryAsset } from "./dictionary-contract";
import { addToLookupLibrary } from "./lookup-library";
import { firstCardOf } from "./word-cards";
import { resolveLibraryWords, wordKey, wordsOf, type LibraryWord } from "./words";

// What a lookup leaves behind: the field, the lookup library, and the one word
// card extended. `opens` counts the lookups that opened words, so the screen
// can tell that the autocomplete is settled even when the same card opens twice.
export type LookupSession = {
  query: string;
  libraryWords: readonly LibraryWord[];
  expandedCard: string | null;
  opens: number;
};

export type LookupSessionEvent =
  | { kind: "query-changed"; query: string }
  | { kind: "dictionary-loaded"; dictionary: Pick<DictionaryAsset, "entries" | "wordAliases"> }
  | { kind: "submitted"; outcome: LookupOutcome | null }
  | { kind: "picked"; choice: Pick<LookupChoice, "word"> }
  | { kind: "deep-linked"; outcome: LookupOutcome }
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
  };
}

export function reduceLookupSession({
  session,
  event,
  entries,
}: {
  session: LookupSession;
  event: LookupSessionEvent;
  entries: DictionaryAsset["entries"] | null;
}): LookupSession {
  switch (event.kind) {
    case "query-changed":
      return { ...session, query: event.query, expandedCard: null };
    case "dictionary-loaded": {
      const libraryWords = resolveLibraryWords({ libraryWords: session.libraryWords, dictionary: event.dictionary });
      return libraryWords === session.libraryWords ? session : { ...session, libraryWords };
    }
    case "submitted":
    case "deep-linked": {
      // The field empties on submit and stays as it was on a deep link.
      const query = event.kind === "submitted" ? "" : session.query;
      const { outcome } = event;
      if (outcome?.kind === "result") {
        const { headword } = outcome;
        const words = wordsOf({ headword, senses: outcome.senses }).map(({ word }) => ({ headword, word }));
        return open(session, words, firstCardOf({ headword, entries }), query);
      }

      // A word like "fika" indexes several words, so an exact link opens all of
      // them rather than the one a suggestion would.
      const words = event.kind === "deep-linked" && outcome?.kind === "choices"
        ? outcome.choices.filter((choice) => choice.exact).map(({ word }) => word)
        : [];
      return words.length === 0
        ? session
        : open(session, words, firstCardOf({ headword: words[0].headword, entries }), query);
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
