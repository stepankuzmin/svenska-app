import {
  Fragment,
  lazy,
  Suspense,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
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
import { sortLookupLibrary, type LibrarySort } from "./lookup-library";
import { readReviewState, reviewQueue, writeReviewState, type ReviewState } from "./review-schedule";
import { queryMatches, withForm, type QueryMatch } from "./query-match";
import { useSwipeToRemove } from "./use-swipe-to-remove";
import { mergeState, useListener } from "./use-subscription";
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

const Review = lazy(() => import("./review").catch(() => ({
  default: () => <div className="lookup-status" role="status">Reload to review words.</div>,
})));

const reviewHash = "#review";
const sortLabels: Record<LibrarySort, string> = { added: "Newest first", frequency: "Most used" };

type ReviewLaunch = { state: ReviewState; open: boolean; now: number };

type Menu = { open: boolean; active: number; rendered: number; opens: number };
type MenuEvent =
  | { kind: "closed" }
  | { kind: "word-opened"; opens: number }
  | { kind: "typed"; open: boolean }
  | { kind: "shown"; open: boolean }
  | { kind: "moved"; active: number }
  | { kind: "hovered"; active: number }
  | { kind: "scrolled-to-end"; total: number };

function reduceMenu(menu: Menu, event: MenuEvent): Menu {
  switch (event.kind) {
    case "closed": return { ...menu, open: false, active: -1 };
    case "word-opened": return { ...menu, open: false, active: -1, opens: event.opens };
    case "typed": return { ...menu, open: event.open, active: -1, rendered: suggestionBatchSize };
    case "shown": return { ...menu, open: event.open };
    case "moved": return { ...menu, open: true, active: event.active, rendered: Math.max(menu.rendered, event.active + 1) };
    case "hovered": return { ...menu, active: event.active };
    case "scrolled-to-end": return { ...menu, rendered: Math.min(event.total, menu.rendered + suggestionBatchSize) };
  }
}

const ReviewLauncher = memo(function ReviewLauncher({ library }: { library: readonly WordCardContent[] }) {
  const cards = useMemo(() => library.filter((card) => card.translation !== ""), [library]);
  const [{ state, open, now }, update] = useReducer(mergeState<ReviewLaunch>, undefined, () => ({
    state: readReviewState(), open: location.hash === reviewHash, now: Date.now(),
  }));
  const pushed = useRef(false);
  const keys = useMemo(() => cards.map((card) => card.card), [cards]);
  const { next, counts } = reviewQueue(state, keys, now);
  const due = counts.new + counts.learning + counts.review;

  useListener(window, "popstate", () => update({ open: location.hash === reviewHash, now: Date.now() }));
  useListener(window, "storage", () => update({ state: readReviewState() }));
  useListener(document, "visibilitychange", () => update({ now: Date.now() }));

  function close() {
    if (pushed.current) {
      pushed.current = false;
      history.back();
      return;
    }
    history.replaceState(null, "", location.pathname + location.search);
    update({ open: false, now: Date.now() });
  }

  if (cards.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className="lookup-action"
        onClick={() => {
          history.pushState(null, "", reviewHash);
          pushed.current = true;
          update({ open: true, now: Date.now() });
        }}
      >
        {"Review "}
        <span className="word-card-type">{due > 0 ? `${due} due` : "Done for today"}</span>
      </button>
      {open ? (
        <Suspense fallback={null}>
          <Review
            cards={cards}
            state={state}
            now={now}
            next={next}
            counts={counts}
            onChange={(next) => {
              update({ state: next, now: Date.now() });
              writeReviewState(next);
            }}
            onClose={close}
          />
        </Suspense>
      ) : null}
    </>
  );
});

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

function sortCards(library: readonly WordCardContent[], { libraryWords, entries }: Pick<LookupExperienceProps, "libraryWords" | "entries">, sort: LibrarySort) {
  const order = new Map(sortLookupLibrary({ libraryWords, entries, sort }).map((word, index) => [wordKey(word), index]));
  return library.toSorted((left, right) => (order.get(left.card) ?? 0) - (order.get(right.card) ?? 0));
}

export function LookupExperience(props: LookupExperienceProps) {
  const [sort, setSort] = useState<LibrarySort>("added");
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
  const { libraryWords, entries } = props;
  const sortedLibrary = useMemo(() => sortCards(library, { libraryWords, entries }, sort), [library, libraryWords, entries, sort]);
  const reviewCards = useMemo(() => sortCards(library, { libraryWords, entries }, "frequency"), [library, libraryWords, entries]);
  const inputId = "dictionary-query";
  const listId = "lookup-suggestions";
  const placeholder = props.status === "loading" ? "Loading dictionary…" : "Swedish or Russian";
  const hasQuery = props.query.trim().length > 0;
  const [menu, dispatchMenu] = useReducer(reduceMenu, { open: hasQuery, active: -1, rendered: suggestionBatchSize, opens: props.opens });
  if (menu.opens !== props.opens) dispatchMenu({ kind: "word-opened", opens: props.opens });
  const { open: autocompleteOpen, active: activeSuggestionIndex, rendered: renderedSuggestionCount } = menu;
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
    if (activeSuggestionIndex >= 0) {
      document.getElementById(`${listId}-${activeSuggestionIndex}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [activeSuggestionIndex, visibleSuggestions.length]);

  const scrolledOpens = useRef(0);
  const expandedShown = sortedLibrary.some((item) => item.card === props.expandedCard);
  useEffect(() => {
    if (!expandedShown || scrolledOpens.current === props.opens) return;
    scrolledOpens.current = props.opens;
    document.querySelector(".word-card[open]")?.scrollIntoView({ block: "nearest" });
  }, [props.opens, expandedShown]);

  const selectSuggestion = useCallback((item: LookupChoice) => {
    latest.current.onSelectSuggestion(item);
  }, []);

  const revealMoreSuggestions = useCallback((event: UIEvent<HTMLUListElement>) => {
    const list = event.currentTarget;
    if (list.scrollTop + list.clientHeight < list.scrollHeight - 1) {
      return;
    }

    dispatchMenu({ kind: "scrolled-to-end", total: latest.current.suggestionCount });
  }, []);

  const activateSuggestion = useCallback((active: number) => dispatchMenu({ kind: "hovered", active }), []);

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
    if (target instanceof Element && target.closest(".lookup-autocomplete, .word-card-list, .pasted-list, a, button, select, label") === null) {
      queryInput.current?.focus();
    }
  }

  function closeAutocompleteOutsideForm(target: EventTarget) {
    if (target instanceof Element && target.closest(".lookup-autocomplete") === null) {
      dispatchMenu({ kind: "shown", open: false });
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
            dispatchMenu({ kind: "typed", open: event.target.value.trim().length > 0 });
          }}
          onPointerDown={() => dispatchMenu({ kind: "shown", open: hasQuery })}
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
              dispatchMenu({ kind: "moved", active: Math.min(activeSuggestionIndex + 1, suggestions.length - 1) });
            } else if (event.key === "ArrowUp" && suggestions.length > 0) {
              event.preventDefault();
              dispatchMenu({ kind: "moved", active: Math.max(activeSuggestionIndex - 1, -1) });
            } else if (event.key === "Enter" && activeSuggestion !== undefined) {
              event.preventDefault();
              selectSuggestion(activeSuggestion);
            } else if (event.key === "Tab" || event.key === "Escape") {
              dispatchMenu({ kind: "closed" });
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
              dispatchMenu({ kind: "closed" });
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
            onActivate={activateSuggestion}
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
          <div className="lookup-actions">
            <ReviewLauncher library={reviewCards} />
            <label className="lookup-sort">
              <span aria-hidden="true">
                {sortLabels[sort]}{" "}
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m3 6 3 3 3-3" /></svg>
              </span>
              <select aria-label="Sort words" value={sort} onChange={(event) => setSort(event.target.value === "frequency" ? "frequency" : "added")}>
                <option value="added">{sortLabels.added}</option>
                <option value="frequency">{sortLabels.frequency}</option>
              </select>
            </label>
          </div>
          <ul className="word-card-list" role="list">
            {sortedLibrary.map((item, index) => (
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
        <span aria-hidden="true"> · </span>
        <a href="https://spraakbanken.gu.se/en/resources/kelly">Kelly frequency data</a>
        {props.syncControl}
      </div>
    </main>
  );
}
