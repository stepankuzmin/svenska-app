import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactElement,
  type UIEvent,
} from "react";
import type { DictionaryAsset, DictionaryDetailsAsset } from "./dictionary-contract";
import type { LookupChoice, LookupOutcome } from "./dictionary";
import { normalizeLookupText } from "./normalize-lookup-text";
import { wordForms } from "./word-forms";
import { useSwipeToRemove } from "./use-swipe-to-remove";
import { wordKey, wordsOf, type LibraryWord } from "./words";

type DictionarySense = DictionaryAsset["entries"][string][number];
type WordDetails = DictionaryDetailsAsset["entries"][string][number];

export type LookupStatus = "loading" | "ready" | "unavailable-offline";

type LookupExperienceProps = {
  query: string;
  status: LookupStatus;
  outcome: LookupOutcome | null;
  entries: DictionaryAsset["entries"] | null;
  details: DictionaryDetailsAsset["entries"] | null;
  libraryWords: readonly LibraryWord[];
  deepLinkHeadword: string | null;
  onQueryChange: (query: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSelectSuggestion: (word: LibraryWord) => void;
  onRemoveWord: (card: string) => void;
};

// One card holds one word: the senses Lexin inflects the same way. A spelling
// that carries an en-word and an ett-word carries two words, so it fills a card
// each, and `card` tells them apart wherever a headword alone cannot.
type WordItem = {
  card: string;
  headword: string;
  forms: readonly string[];
  senses: readonly DictionarySense[];
  details: readonly WordDetails[];
  relatedWords: readonly RelatedWord[];
};

type RelatedWord = {
  headword: string;
  translation: string;
};

const suggestionBatchSize = 100;

// Every named card costs a snapshot pair, so only the cards a phone can show
// take part in the move to the top.
const animatedCardLimit = 12;

function cleanLexinText(value: string): string {
  return value.replaceAll("|", "");
}

function uniqueNonEmpty(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function translationFor(senses: readonly DictionarySense[]): string {
  return uniqueNonEmpty(senses.map((sense) => sense.translation)).join(" · ");
}

function getSuggestionItems(outcome: LookupOutcome | null): readonly LookupChoice[] {
  if (outcome === null || outcome.kind === "no-match") {
    return [];
  }

  return outcome.kind === "result" ? outcome.suggestions : outcome.choices;
}

function formsOf({
  headword,
  senses,
  senseIndexes,
  wordDetails,
}: {
  headword: string;
  senses: readonly DictionarySense[];
  senseIndexes: readonly number[];
  wordDetails: readonly WordDetails[];
}): readonly string[] {
  return wordForms({
    headword: cleanLexinText(headword),
    senses: senseIndexes.map((senseIndex) => ({
      partOfSpeech: senses[senseIndex].partOfSpeech,
      article: wordDetails[senseIndex]?.article ?? "",
      inflections: (wordDetails[senseIndex]?.inflections ?? []).map(cleanLexinText),
    })),
  });
}

// Every suggestion reads the same way, so a list scans down one column of
// Swedish words: the word, its type and translation on the first line, and its
// Swedish forms beneath, as its card has them. A word with one form still
// fills the line, and a Russian query offers the same rows, with what it
// matched among the translations.
type SuggestionRow = {
  headword: string;
  partsOfSpeech: string;
  translation: string;
  forms: string;
};

function suggestionRow(
  { headword, word }: LibraryWord,
  entries: DictionaryAsset["entries"] | null,
  details: DictionaryDetailsAsset["entries"] | null,
): SuggestionRow {
  const cleanHeadword = cleanLexinText(headword);
  const senses = entries?.[headword] ?? [];
  const found = wordsOf({ headword, senses }).find((item) => item.word === word);
  const wordSenses = found?.senseIndexes.map((senseIndex) => senses[senseIndex]) ?? [];
  const forms = found === undefined
    ? []
    : formsOf({ headword, senses, senseIndexes: found.senseIndexes, wordDetails: details?.[headword] ?? [] });
  return {
    headword: cleanHeadword,
    partsOfSpeech: uniqueNonEmpty(wordSenses.map((sense) => sense.partOfSpeech)).join(" · "),
    translation: translationFor(wordSenses),
    forms: (forms.length > 0 ? forms : [cleanHeadword]).join(", "),
  };
}

function getLibraryItems(
  libraryWords: readonly LibraryWord[],
  entries: DictionaryAsset["entries"] | null,
  details: DictionaryDetailsAsset["entries"] | null,
): readonly WordItem[] {
  if (entries === null) {
    return [];
  }

  return libraryWords.flatMap((libraryWord) => {
    const { headword } = libraryWord;
    const senses = entries[headword];
    if (senses === undefined) {
      return [];
    }

    const word = wordsOf({ headword, senses }).find((item) => item.word === libraryWord.word);
    if (word === undefined) {
      return [];
    }

    const wordDetails = details?.[headword] ?? [];
    const item = {
      card: wordKey(libraryWord),
      headword,
      forms: formsOf({ headword, senses, senseIndexes: word.senseIndexes, wordDetails }),
      senses: word.senseIndexes.map((senseIndex) => senses[senseIndex]),
      details: word.senseIndexes.flatMap((senseIndex) => wordDetails[senseIndex] ?? []),
    };
    return [{ ...item, relatedWords: getRelatedWords(item) }];
  });
}

function getRelatedWords(item: Omit<WordItem, "relatedWords">): readonly RelatedWord[] {
  const related = new Map<string, RelatedWord>();
  const normalizedHeadword = normalizeLookupText(cleanLexinText(item.headword));

  for (const compound of item.details.flatMap((details) => details.compounds)) {
    const headword = cleanLexinText(compound.swedish);
    const normalizedCompound = normalizeLookupText(headword);
    if (normalizedCompound !== normalizedHeadword) {
      related.set(normalizedCompound, { headword, translation: compound.russian });
    }
  }

  return [...related.values()].slice(0, 8);
}

const WordCard = memo(function WordCard({
  item,
  expanded,
  transitionName,
  onToggle,
  onRemove,
}: {
  item: WordItem;
  expanded: boolean;
  transitionName: string;
  onToggle: (card: string) => void;
  onRemove: (card: string) => void;
}) {
  const swipe = useSwipeToRemove({ onRemove: () => onRemove(item.card) });
  const partsOfSpeech = uniqueNonEmpty(item.senses.map((sense) => sense.partOfSpeech));
  const phonetics = uniqueNonEmpty(item.details.map((details) => details.phonetic));
  const examples = item.details.flatMap((details) => details.examples);
  const translation = translationFor(item.senses);
  const hasMeanings = item.senses.some((sense) => sense.meaning.length > 0);
  const copy = (
    <span className="word-card-heading">
      <strong lang="sv">{cleanLexinText(item.headword)}</strong>
      {partsOfSpeech.length > 0 ? " " : null}
      {partsOfSpeech.length > 0 ? <span className="word-card-type">{partsOfSpeech.join(" · ")}</span> : null}
      {translation.length > 0 ? " " : null}
      {translation.length > 0 ? <span className="word-card-translation" lang="ru">{translation}</span> : null}
    </span>
  );

  const style = (transitionName.length > 0
    ? { "--word-card-name": transitionName }
    : undefined) as CSSProperties | undefined;

  // Swiping the card aside is the way out, and the same affordance the swipe
  // reveals is a control the keyboard can reach.
  function asRow(card: ReactElement) {
    return (
      <li style={style}>
        <div className="word-card-row">
          <div className="word-card-swipe" {...swipe.surfaceProps}>{card}</div>
          <button
            type="button"
            className="word-card-remove"
            aria-label={`Remove ${item.forms[0] ?? cleanLexinText(item.headword)} from the library`}
            onClick={swipe.remove}
          >
            Remove
          </button>
        </div>
      </li>
    );
  }

  if (
    phonetics.length === 0 &&
    item.forms.length <= 1 &&
    !hasMeanings &&
    examples.length === 0 &&
    item.relatedWords.length === 0
  ) {
    return asRow(<div className="word-card-plain">{copy}</div>);
  }

  return asRow(
    (
      <details className="word-card" open={expanded}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            onToggle(item.card);
          }}
        >
          <span className="word-card-disclosure" aria-hidden="true" />
          {copy}
        </summary>

        <div className="word-card-details">
          {phonetics.length > 0 || item.forms.length > 1 ? (
            <p className="word-card-forms" lang="sv">
              {phonetics.length > 0 ? <span>[{phonetics.join(", ")}]</span> : null}
              {phonetics.length > 0 && item.forms.length > 1 ? " " : null}
              {item.forms.length > 1 ? <span>{item.forms.join(", ")}</span> : null}
            </p>
          ) : null}
          {hasMeanings ? (
            <div className="word-card-senses">
              {item.senses.map((sense, index) => (
                <p key={`${sense.meaning}-${sense.translation}-${index}`}>
                  {sense.meaning.length > 0 ? <span lang="sv">{sense.meaning}</span> : null}
                  {sense.translation.length > 0 ? <span lang="ru">{sense.translation}</span> : null}
                </p>
              ))}
            </div>
          ) : null}
          {examples.length > 0 ? (
            <section aria-label={`Examples for ${cleanLexinText(item.headword)}`}>
              <h3>Examples</h3>
              <ul role="list">
                {examples.map((example, index) => (
                  <li key={`${example.swedish}-${example.russian}-${index}`}>
                    <span lang="sv">{example.swedish}</span>
                    {example.russian.length > 0 ? <span lang="ru">{example.russian}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {item.relatedWords.length > 0 ? (
            <section aria-label={`Words containing ${cleanLexinText(item.headword)}`}>
              <h3>More with <span lang="sv">{cleanLexinText(item.headword)}</span></h3>
              <ul role="list">
                {item.relatedWords.map((relatedWord) => (
                  <li key={relatedWord.headword}>
                    <span lang="sv">{relatedWord.headword}</span>
                    {relatedWord.translation.length > 0 ? <span lang="ru">{relatedWord.translation}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </details>
    ),
  );
});

const noSuggestions: readonly LookupChoice[] = [];

// The menu renders behind the field: while the deferred list is unchanged, a
// keystroke re-renders the input and stops at this boundary.
const SuggestionMenu = memo(function SuggestionMenu({
  listId,
  items,
  totalCount,
  activeIndex,
  stale,
  entries,
  details,
  onSelect,
  onActivate,
  onScroll,
}: {
  listId: string;
  items: readonly LookupChoice[];
  totalCount: number;
  activeIndex: number;
  stale: boolean;
  entries: DictionaryAsset["entries"] | null;
  details: DictionaryDetailsAsset["entries"] | null;
  onSelect: (item: LookupChoice) => void;
  onActivate: (index: number) => void;
  onScroll: (event: UIEvent<HTMLUListElement>) => void;
}) {
  const rows = useMemo(
    () => items.map((item) => suggestionRow(item.word, entries, details)),
    [items, entries, details],
  );

  return (
    <ul
      id={listId}
      className={stale ? "suggestion-menu is-stale" : "suggestion-menu"}
      role="listbox"
      aria-label="Suggestions"
      onScroll={onScroll}
    >
      {items.map((item, index) => {
        const row = rows[index];
        return (
          <li
            id={`${listId}-${index}`}
            key={wordKey(item.word)}
            role="option"
            aria-selected={index === activeIndex}
            aria-posinset={index + 1}
            aria-setsize={totalCount}
            onClick={() => onSelect(item)}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") {
                onActivate(index);
              }
            }}
          >
            <span className="suggestion-word">
              <strong lang="sv">{row.headword}</strong>
              {row.partsOfSpeech.length > 0 ? " " : null}
              {row.partsOfSpeech.length > 0
                ? <span className="suggestion-type">{row.partsOfSpeech}</span>
                : null}
              {row.translation.length > 0 ? " " : null}
              {row.translation.length > 0
                ? <span className="suggestion-translation" lang="ru">{row.translation}</span>
                : null}
            </span>
            {" "}
            <span className="suggestion-forms" lang="sv">{row.forms}</span>
          </li>
        );
      })}
    </ul>
  );
});

export function LookupExperience(props: LookupExperienceProps) {
  // The field owns the urgent update; a hundred suggestion rows render behind
  // it, so a keystroke never waits on the list it will replace.
  const matches = useMemo(() => getSuggestionItems(props.outcome), [props.outcome]);
  const suggestions = useDeferredValue(matches);
  const library = useMemo(
    () => getLibraryItems(props.libraryWords, props.entries, props.details),
    [props.libraryWords, props.entries, props.details],
  );
  const inputId = "dictionary-query";
  const listId = "lookup-suggestions";
  const placeholder = props.status === "loading" ? "Loading dictionary…" : "Swedish or Russian";
  const [autocompleteOpen, setAutocompleteOpen] = useState(props.query.trim().length > 0);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [renderedSuggestionCount, setRenderedSuggestionCount] = useState(suggestionBatchSize);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const transitionNames = useRef(new Map<string, string>());
  const visibleSuggestions = useMemo(
    () => (autocompleteOpen ? suggestions.slice(0, renderedSuggestionCount) : noSuggestions),
    [autocompleteOpen, suggestions, renderedSuggestionCount],
  );
  const activeSuggestion = visibleSuggestions[activeSuggestionIndex];
  const suggestionsStale = matches !== suggestions;
  // A query the dictionary cannot place says so, rather than leaving the field
  // to answer with nothing.
  const showNoMatches = autocompleteOpen &&
    props.status === "ready" &&
    props.query.trim().length > 0 &&
    matches.length === 0;
  const queryInput = useRef<HTMLInputElement>(null);
  // The menu's handlers read what the last render saw, so they keep one
  // identity and the menu keeps its place across a keystroke.
  const latest = useRef({
    onSelectSuggestion: props.onSelectSuggestion,
    suggestionCount: suggestions.length,
  });
  latest.current = {
    onSelectSuggestion: props.onSelectSuggestion,
    suggestionCount: suggestions.length,
  };
  // A touch device focuses the field on the first tap instead, so the caret
  // never sits in a field that cannot raise a keyboard yet.
  const [autoFocusField] = useState(() => !window.matchMedia("(pointer: coarse)").matches);

  useEffect(() => {
    if (props.deepLinkHeadword === null) {
      return;
    }

    setAutocompleteOpen(false);
    setActiveSuggestionIndex(-1);
    setExpandedCard(firstCardOf(props.deepLinkHeadword));
  }, [props.deepLinkHeadword]);

  useEffect(() => {
    if (activeSuggestionIndex >= 0) {
      document.getElementById(`${listId}-${activeSuggestionIndex}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [activeSuggestionIndex, visibleSuggestions.length]);

  const selectSuggestion = useCallback((item: LookupChoice) => {
    setAutocompleteOpen(false);
    setActiveSuggestionIndex(-1);
    setExpandedCard(wordKey(item.word));
    latest.current.onSelectSuggestion(item.word);
  }, []);

  const revealMoreSuggestions = useCallback((event: UIEvent<HTMLUListElement>) => {
    const list = event.currentTarget;
    if (list.scrollTop + list.clientHeight < list.scrollHeight - 1) {
      return;
    }

    setRenderedSuggestionCount((current) =>
      Math.min(latest.current.suggestionCount, current + suggestionBatchSize),
    );
  }, []);

  // A spelling that holds more than one word opens a card each, and the lookup
  // extends the first of them.
  function firstCardOf(headword: string): string | null {
    const senses = props.entries?.[headword];
    const [firstWord] = senses === undefined ? [] : wordsOf({ headword, senses });
    return firstWord === undefined ? null : wordKey(firstWord);
  }

  // A card name can hold any character, so cards are named by order of first
  // sight rather than by a sanitised name that could collide.
  function transitionNameFor(card: string): string {
    const existing = transitionNames.current.get(card);
    if (existing !== undefined) {
      return existing;
    }

    const name = `word-card-${transitionNames.current.size}`;
    transitionNames.current.set(card, name);
    return name;
  }

  const toggleExpanded = useCallback((card: string) => {
    setExpandedCard((currentCard) => currentCard === card ? null : card);
  }, []);

  function submitLookup(event: FormEvent<HTMLFormElement>) {
    props.onSubmit(event);
    if (props.outcome?.kind === "result") {
      setAutocompleteOpen(false);
      setActiveSuggestionIndex(-1);
      setExpandedCard(firstCardOf(props.outcome.headword));
      props.onQueryChange("");
    }
  }

  // Focusing from a tap on the page keeps the keyboard a gesture away without
  // making the user land on the field itself.
  function focusFieldFromBackground(target: EventTarget) {
    if (target instanceof Element && target.closest(".lookup-autocomplete, .word-card-list, a") === null) {
      queryInput.current?.focus();
    }
  }

  function closeAutocompleteOutsideForm(target: EventTarget) {
    if (target instanceof Element && target.closest(".lookup-autocomplete") === null) {
      setAutocompleteOpen(false);
    }
  }

  return (
    <main
      className="minimal-lookup"
      onPointerDownCapture={(event) => closeAutocompleteOutsideForm(event.target)}
      onFocusCapture={(event) => closeAutocompleteOutsideForm(event.target)}
      onClick={(event) => focusFieldFromBackground(event.target)}
    >
      <form className="lookup-autocomplete" action="/" method="get" onSubmit={submitLookup}>
        <label className="visually-hidden" htmlFor={inputId}>Swedish or Russian word</label>
        <input
          ref={queryInput}
          id={inputId}
          name="q"
          role="combobox"
          value={props.query}
          onChange={(event) => {
            props.onQueryChange(event.target.value);
            setAutocompleteOpen(event.target.value.trim().length > 0);
            setActiveSuggestionIndex(-1);
            setRenderedSuggestionCount(suggestionBatchSize);
            setExpandedCard(null);
          }}
          onPointerDown={() => setAutocompleteOpen(props.query.trim().length > 0)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) {
              return;
            }

            if (event.key === "ArrowDown" && suggestions.length > 0) {
              event.preventDefault();
              setAutocompleteOpen(true);
              const nextIndex = Math.min(activeSuggestionIndex + 1, suggestions.length - 1);
              setRenderedSuggestionCount((current) => Math.max(current, nextIndex + 1));
              setActiveSuggestionIndex(nextIndex);
            } else if (event.key === "ArrowUp" && suggestions.length > 0) {
              event.preventDefault();
              setAutocompleteOpen(true);
              setActiveSuggestionIndex(Math.max(activeSuggestionIndex - 1, -1));
            } else if (event.key === "Enter" && activeSuggestion !== undefined) {
              event.preventDefault();
              selectSuggestion(activeSuggestion);
            } else if (event.key === "Tab") {
              setAutocompleteOpen(false);
              setActiveSuggestionIndex(-1);
            } else if (event.key === "Escape") {
              setAutocompleteOpen(false);
              setActiveSuggestionIndex(-1);
            }
          }}
          aria-autocomplete="list"
          aria-controls={visibleSuggestions.length > 0 ? listId : undefined}
          aria-expanded={visibleSuggestions.length > 0}
          aria-activedescendant={activeSuggestion === undefined ? undefined : `${listId}-${activeSuggestionIndex}`}
          placeholder={placeholder}
          autoFocus={autoFocusField}
          enterKeyHint="search"
          autoComplete="off"
          spellCheck="false"
        />
        {props.query.length > 0 ? (
          <button
            type="button"
            className="lookup-clear"
            aria-label="Clear search"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              props.onQueryChange("");
              setAutocompleteOpen(false);
              setActiveSuggestionIndex(-1);
              setExpandedCard(null);
              queryInput.current?.focus();
            }}
          >
            <span aria-hidden="true">
              <svg viewBox="0 0 16 16" focusable="false">
                <path d="M5 5L11 11M11 5L5 11" />
              </svg>
            </span>
          </button>
        ) : null}
        {visibleSuggestions.length > 0 ? (
          <SuggestionMenu
            listId={listId}
            items={visibleSuggestions}
            totalCount={suggestions.length}
            activeIndex={activeSuggestionIndex}
            stale={suggestionsStale}
            entries={props.entries}
            details={props.details}
            onSelect={selectSuggestion}
            onActivate={setActiveSuggestionIndex}
            onScroll={revealMoreSuggestions}
          />
        ) : null}
        {showNoMatches ? (
          <p className="suggestion-empty" role="status">No matches</p>
        ) : null}
      </form>

      <div
        className={props.status === "unavailable-offline" ? "lookup-status" : "visually-hidden"}
        role="status"
        aria-live="polite"
      >
        {props.status === "loading" ? "Loading dictionary…" : null}
        {props.status === "unavailable-offline"
          ? "Connect once while online. After that, you can look up words offline."
          : null}
      </div>

      {library.length > 0 ? (
        <section className="word-library" aria-labelledby="lookup-library-heading">
          <h2 className="visually-hidden" id="lookup-library-heading">Library</h2>
          <ul className="word-card-list" role="list">
            {library.map((item, index) => (
              <WordCard
                key={item.card}
                item={item}
                expanded={expandedCard === item.card}
                transitionName={index < animatedCardLimit ? transitionNameFor(item.card) : ""}
                onToggle={toggleExpanded}
                onRemove={props.onRemoveWord}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <p className="lookup-attribution">
        <span>Lexin, ISOF</span>
        <span aria-hidden="true"> · </span>
        <a rel="license" href="https://creativecommons.org/licenses/by/4.0/">
          CC BY 4.0
        </a>
      </p>
    </main>
  );
}
