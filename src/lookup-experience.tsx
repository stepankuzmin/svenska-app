import {
  Fragment,
  lazy,
  Suspense,
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
  type ReactNode,
  type UIEvent,
} from "react";
import type { DictionaryAsset, DictionaryDetailsAsset } from "./dictionary-contract";
import { choicesOf, type LookupChoice, type LookupOutcome } from "./dictionary";
import { isList, type PastedLine, type PastedList } from "./lookup-session";
import { queryMatches, withForm, type QueryMatch } from "./query-match";
import { useSwipeToRemove } from "./use-swipe-to-remove";
import { suggestionRow, wordCards, type WordCardContent } from "./word-cards";
import { wordKey, type LibraryWord } from "./words";

export type LookupStatus = "loading" | "ready" | "unavailable-offline" | "failed";

type LookupExperienceProps = {
  syncControl?: ReactNode;
  storageError?: boolean;
  query: string;
  status: LookupStatus;
  outcome: LookupOutcome | null;
  entries: DictionaryAsset["entries"] | null;
  details: DictionaryDetailsAsset["entries"] | null;
  libraryWords: readonly LibraryWord[];
  expandedCard: string | null;
  opens: number;
  pastedList: PastedList | null;
  onAddList: (lines: readonly PastedLine[], words: readonly LibraryWord[]) => void;
  onCloseList: () => void;
  onQueryChange: (query: string) => void;
  onPasteList: (text: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSelectSuggestion: (choice: LookupChoice) => void;
  onToggleCard: (card: string) => void;
  onRemoveWord: (card: string) => void;
};

const WordCardDetails = lazy(() => import("./word-card-details").catch(() => ({
  default: () => <div className="word-card-details" role="status">Reload to view word details.</div>,
})));

const PastedListReview = lazy(() => import("./pasted-list-review").catch(() => ({
  default: () => <div className="lookup-status" role="status">Reload to review the pasted list.</div>,
})));

const suggestionBatchSize = 100;

// Every named card costs a snapshot pair, so only the cards a phone can show
// take part in the move to the top.
const animatedCardLimit = 12;

const WordCard = memo(function WordCard({
  item,
  expanded,
  transitionName,
  onToggle,
  onRemove,
}: {
  item: WordCardContent;
  expanded: boolean;
  transitionName: string;
  onToggle: (card: string) => void;
  onRemove: (card: string) => void;
}) {
  const swipe = useSwipeToRemove({ onRemove: () => onRemove(item.card) });
  const { wordType, translation } = item;
  const copy = (
    <span className="word-card-heading">
      <strong lang="sv">{item.citation}</strong>
      {wordType ? <span className="word-card-type">{` (${wordType})`}</span> : null}
      {translation ? <span className="word-card-translation" lang="ru">{` ${translation}`}</span> : null}
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
            aria-label={`Remove ${item.citation} from the library`}
            onClick={swipe.remove}
          >
            Remove
          </button>
        </div>
      </li>
    );
  }

  if (!item.extendable) {
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
          <span className="word-card-disclosure" aria-hidden="true"><span /></span>
          {copy}
        </summary>

        <Suspense fallback={<div className="word-card-details" />}><WordCardDetails item={item} /></Suspense>
      </details>
    ),
  );
});

const noSuggestions: readonly LookupChoice[] = [];

// Every place a row spells the query reads marked, so the row shows why it
// answers.
function MarkedText({ text, matches }: { text: string; matches: readonly QueryMatch[] }) {
  return (
    <>
      {matches.map((match, index) => (
        <Fragment key={match.start}>
          {text.slice(matches[index - 1]?.end ?? 0, match.start)}
          <mark>{text.slice(match.start, match.end)}</mark>
        </Fragment>
      ))}
      {text.slice(matches.at(-1)?.end ?? 0)}
    </>
  );
}

// The menu renders behind the field: while the deferred list is unchanged, a
// keystroke re-renders the input and stops at this boundary.
const SuggestionMenu = memo(function SuggestionMenu({
  listId,
  items,
  query,
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
  query: string;
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
    () => items.map((item) => suggestionRow({ word: item.word, entries, details })),
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
        // A Russian query marks the translation, a Swedish one the forms.
        const forms = item.form ? withForm({ forms: row.forms, form: item.form, query }) : row.forms;
        const translationMatches = item.form ? [] : queryMatches({ text: row.translation, query });
        const formMatches = item.form ? queryMatches({ text: forms, query }) : [];
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
                ? (
                  <span className="suggestion-translation" lang="ru">
                    <MarkedText text={row.translation} matches={translationMatches} />
                  </span>
                )
                : null}
            </span>
            {" "}
            <span className="suggestion-forms" lang="sv">
              <MarkedText text={forms} matches={formMatches} />
            </span>
          </li>
        );
      })}
    </ul>
  );
});

export function LookupExperience(props: LookupExperienceProps) {
  // The field owns the urgent update; a hundred suggestion rows render behind
  // it, so a keystroke never waits on the list it will replace.
  // The rows mark the query they answer, so the query defers with them.
  const matches = useMemo(
    () => ({ choices: choicesOf(props.outcome), query: props.query }),
    [props.outcome, props.query],
  );
  const deferredMatches = useDeferredValue(matches);
  const suggestions = deferredMatches.choices;
  const library = useMemo(
    () => wordCards({ libraryWords: props.libraryWords, entries: props.entries, details: props.details }),
    [props.libraryWords, props.entries, props.details],
  );
  const inputId = "dictionary-query";
  const listId = "lookup-suggestions";
  const placeholder = props.status === "loading" ? "Loading dictionary…" : "Swedish or Russian";
  const hasQuery = props.query.trim().length > 0;
  const [autocompleteOpen, setAutocompleteOpen] = useState(hasQuery);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [renderedSuggestionCount, setRenderedSuggestionCount] = useState(suggestionBatchSize);
  const transitionNames = useRef(new Map<string, string>());
  const visibleSuggestions = useMemo(
    () => (autocompleteOpen ? suggestions.slice(0, renderedSuggestionCount) : noSuggestions),
    [autocompleteOpen, suggestions, renderedSuggestionCount],
  );
  const activeSuggestion = visibleSuggestions[activeSuggestionIndex];
  const suggestionsStale = matches !== deferredMatches;
  const showNoMatches = autocompleteOpen &&
    props.status === "ready" &&
    hasQuery &&
    matches.choices.length === 0;
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
    if (props.opens === 0) {
      return;
    }

    setAutocompleteOpen(false);
    setActiveSuggestionIndex(-1);
  }, [props.opens]);

  useEffect(() => {
    if (activeSuggestionIndex >= 0) {
      document.getElementById(`${listId}-${activeSuggestionIndex}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [activeSuggestionIndex, visibleSuggestions.length]);

  const selectSuggestion = useCallback((item: LookupChoice) => {
    latest.current.onSelectSuggestion(item);
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

  function submitLookup(event: FormEvent<HTMLFormElement>) {
    props.onSubmit(event);
  }

  // Focusing from a tap on the page keeps the keyboard a gesture away without
  // making the user land on the field itself.
  function focusFieldFromBackground(target: EventTarget) {
    if (target instanceof Element && target.closest(".lookup-autocomplete, .word-card-list, .pasted-list, a, button") === null) {
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
          }}
          onPointerDown={() => setAutocompleteOpen(hasQuery)}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text/plain");
            if (!isList(text)) {
              return;
            }

            event.preventDefault();
            // The keyboard would cover the review the list opens.
            event.currentTarget.blur();
            props.onPasteList(text);
          }}
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
            query={deferredMatches.query}
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
        className={props.storageError || props.status === "unavailable-offline" || props.status === "failed" ? "lookup-status" : "visually-hidden"}
        role="status"
        aria-live="polite"
      >
        {props.status === "loading" ? "Loading dictionary…" : null}
        {props.status === "unavailable-offline"
          ? "Connect once while online to enable offline lookup."
          : null}
        {props.status === "failed" ? "Dictionary did not load. Reload to retry." : null}
        {props.storageError ? "Cannot save words. Reload when online." : null}
      </div>

      {props.pastedList !== null && props.entries !== null ? (
        <Suspense fallback={null}>
          <PastedListReview
            pastedList={props.pastedList}
            entries={props.entries}
            libraryWords={props.libraryWords}
            onAdd={props.onAddList}
            onClose={props.onCloseList}
          />
        </Suspense>
      ) : null}

      {library.length > 0 ? (
        <section className="word-library" aria-labelledby="lookup-library-heading">
          <h2 className="visually-hidden" id="lookup-library-heading">Library</h2>
          <ul className="word-card-list" role="list">
            {library.map((item, index) => (
              <WordCard
                key={item.card}
                item={item}
                expanded={props.expandedCard === item.card}
                transitionName={index < animatedCardLimit ? transitionNameFor(item.card) : ""}
                onToggle={props.onToggleCard}
                onRemove={props.onRemoveWord}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <div className="lookup-attribution">
        <span>Lexin, ISOF</span>
        <span aria-hidden="true"> · </span>
        <a rel="license" href="https://creativecommons.org/licenses/by/4.0/">
          CC BY 4.0
        </a>
        {props.syncControl}
      </div>
    </main>
  );
}
