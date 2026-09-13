import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type UIEvent,
} from "react";
import type { DictionaryAsset, DictionaryDetailsAsset } from "./dictionary-contract";
import type { LookupOutcome } from "./dictionary";
import { normalizeLookupText } from "./normalize-lookup-text";

type DictionarySense = DictionaryAsset["entries"][string][number];
type WordDetails = DictionaryDetailsAsset["entries"][string][number];

type LookupAvailability =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "unavailable-offline" };

type LookupExperienceProps = {
  query: string;
  lookupState: LookupAvailability;
  outcome: LookupOutcome | null;
  entries: DictionaryAsset["entries"] | null;
  details: DictionaryDetailsAsset["entries"] | null;
  libraryHeadwords: readonly string[];
  onQueryChange: (query: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSelectSuggestion: (selection: { headword: string; displayQuery: string }) => void;
};

type WordItem = {
  headword: string;
  senses: readonly DictionarySense[];
  details: readonly WordDetails[];
};

type SuggestionItem = WordItem & {
  displayWord: string;
};

type RelatedWord = {
  headword: string;
  translation: string;
};

const suggestionBatchSize = 100;

function cleanLexinText(value: string): string {
  return value.replaceAll("|", "");
}

function uniqueNonEmpty(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function translationFor(senses: readonly DictionarySense[]): string {
  return uniqueNonEmpty(senses.map((sense) => sense.translation)).join(" · ");
}

function getSuggestionItems({
  outcome,
  entries,
  details,
}: {
  outcome: LookupOutcome | null;
  entries: DictionaryAsset["entries"] | null;
  details: DictionaryDetailsAsset["entries"] | null;
}): readonly SuggestionItem[] {
  if (outcome === null || outcome.kind === "no-match" || entries === null) {
    return [];
  }

  const choices = outcome.kind === "result" ? outcome.suggestions : outcome.choices;
  return choices.flatMap((choice) => {
    const senses = entries[choice.headword];
    return senses === undefined
      ? []
      : [{
          displayWord: choice.displayWord,
          headword: choice.headword,
          senses,
          details: details?.[choice.headword] ?? [],
        }];
  });
}

function getLibraryItems(
  headwords: readonly string[],
  entries: DictionaryAsset["entries"] | null,
  details: DictionaryDetailsAsset["entries"] | null,
): readonly WordItem[] {
  if (entries === null) {
    return [];
  }

  return headwords.flatMap((headword) => {
    const senses = entries[headword];
    return senses === undefined
      ? []
      : [{ headword, senses, details: details?.[headword] ?? [] }];
  });
}

function getRelatedWords(
  item: WordItem,
  entries: DictionaryAsset["entries"],
): readonly RelatedWord[] {
  const related = new Map<string, RelatedWord>();
  const normalizedHeadword = normalizeLookupText(cleanLexinText(item.headword));

  for (const compound of item.details.flatMap((details) => details.compounds)) {
    const headword = cleanLexinText(compound.swedish);
    const normalizedCompound = normalizeLookupText(headword);
    if (normalizedCompound !== normalizedHeadword) {
      related.set(normalizedCompound, { headword, translation: compound.russian });
    }
  }

  if (normalizedHeadword.length > 0) {
    for (const [headword, senses] of Object.entries(entries)) {
      const cleanHeadword = cleanLexinText(headword);
      const normalizedCandidate = normalizeLookupText(cleanHeadword);
      if (
        normalizedCandidate !== normalizedHeadword &&
        normalizedCandidate.includes(normalizedHeadword) &&
        !related.has(normalizedCandidate)
      ) {
        related.set(normalizedCandidate, {
          headword: cleanHeadword,
          translation: translationFor(senses),
        });
      }

      if (related.size >= 8) {
        break;
      }
    }
  }

  return [...related.values()].slice(0, 8);
}

const WordCard = memo(function WordCard({
  item,
  entries,
  expanded,
  onToggle,
}: {
  item: WordItem;
  entries: DictionaryAsset["entries"];
  expanded: boolean;
  onToggle: (headword: string) => void;
}) {
  const partsOfSpeech = uniqueNonEmpty(item.senses.map((sense) => sense.partOfSpeech));
  const phonetics = uniqueNonEmpty(item.details.map((details) => details.phonetic));
  const forms = uniqueNonEmpty([
    cleanLexinText(item.headword),
    ...item.details.flatMap((details) => details.inflections.map(cleanLexinText)),
  ]);
  const examples = item.details.flatMap((details) => details.examples);
  const relatedWords = expanded ? getRelatedWords(item, entries) : [];

  return (
    <li>
      <details className="word-card" open={expanded}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            onToggle(item.headword);
          }}
        >
          <span className="word-card-disclosure" aria-hidden="true" />
          <span className="word-card-copy">
            <span className="word-card-heading">
              <strong lang="sv">{cleanLexinText(item.headword)}</strong>
              {phonetics.length > 0 ? <span lang="sv">[{phonetics.join(", ")}]</span> : null}
              {partsOfSpeech.length > 0 ? <span>{partsOfSpeech.join(" · ")}</span> : null}
            </span>
            {forms.length > 1 ? <span className="word-card-forms" lang="sv">{forms.join(", ")}</span> : null}
            <span className="word-card-senses">
              {item.senses.map((sense, index) => (
                <span className="word-card-sense" key={`${sense.meaning}-${sense.translation}-${index}`}>
                  {sense.meaning.length > 0 ? <span lang="sv">{sense.meaning}</span> : null}
                  {sense.translation.length > 0 ? <span lang="ru">{sense.translation}</span> : null}
                </span>
              ))}
            </span>
          </span>
        </summary>

        <div className="word-card-details">
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
          {relatedWords.length > 0 ? (
            <section aria-label={`Words containing ${cleanLexinText(item.headword)}`}>
              <h3>More with <span lang="sv">{cleanLexinText(item.headword)}</span></h3>
              <ul role="list">
                {relatedWords.map((relatedWord) => (
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
    </li>
  );
});

export function LookupExperience(props: LookupExperienceProps) {
  const suggestions = getSuggestionItems({
    outcome: props.outcome,
    entries: props.entries,
    details: props.details,
  });
  const library = useMemo(
    () => getLibraryItems(props.libraryHeadwords, props.entries, props.details),
    [props.libraryHeadwords, props.entries, props.details],
  );
  const inputId = "dictionary-query";
  const listId = "lookup-suggestions";
  const placeholder = props.lookupState.kind === "loading"
    ? "Loading dictionary…"
    : "Swedish or Russian";
  const [autocompleteOpen, setAutocompleteOpen] = useState(props.query.trim().length > 0);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [renderedSuggestionCount, setRenderedSuggestionCount] = useState(suggestionBatchSize);
  const [expandedHeadword, setExpandedHeadword] = useState<string | null>(null);
  const visibleSuggestions = autocompleteOpen
    ? suggestions.slice(0, renderedSuggestionCount)
    : [];
  const activeSuggestion = visibleSuggestions[activeSuggestionIndex];
  const dictionaryEntries = props.entries;

  useEffect(() => {
    if (activeSuggestionIndex >= 0) {
      document.getElementById(`${listId}-${activeSuggestionIndex}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [activeSuggestionIndex, visibleSuggestions.length]);

  function selectSuggestion(item: SuggestionItem) {
    setAutocompleteOpen(false);
    setActiveSuggestionIndex(-1);
    setExpandedHeadword(item.headword);
    props.onSelectSuggestion({
      headword: item.headword,
      displayQuery: item.displayWord,
    });
  }

  function revealMoreSuggestions(event: UIEvent<HTMLUListElement>) {
    const list = event.currentTarget;
    if (list.scrollTop + list.clientHeight < list.scrollHeight - 1) {
      return;
    }

    setRenderedSuggestionCount((current) =>
      Math.min(suggestions.length, current + suggestionBatchSize),
    );
  }

  const toggleExpanded = useCallback((headword: string) => {
    setExpandedHeadword((currentHeadword) => currentHeadword === headword ? null : headword);
  }, []);

  function submitLookup(event: FormEvent<HTMLFormElement>) {
    props.onSubmit(event);
    if (props.outcome?.kind === "result") {
      setAutocompleteOpen(false);
      setActiveSuggestionIndex(-1);
      setExpandedHeadword(props.outcome.headword);
    }
  }

  return (
    <main className="minimal-lookup">
      <form className="lookup-autocomplete" action="/" method="get" onSubmit={submitLookup}>
        <label className="visually-hidden" htmlFor={inputId}>Swedish or Russian word</label>
        <input
          id={inputId}
          name="q"
          role="combobox"
          value={props.query}
          onChange={(event) => {
            props.onQueryChange(event.target.value);
            setAutocompleteOpen(event.target.value.trim().length > 0);
            setActiveSuggestionIndex(-1);
            setRenderedSuggestionCount(suggestionBatchSize);
            setExpandedHeadword(null);
          }}
          onFocus={() => setAutocompleteOpen(props.query.trim().length > 0)}
          onBlur={() => setAutocompleteOpen(false)}
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
              const lastVisibleIndex = Math.min(renderedSuggestionCount, suggestions.length) - 1;
              setActiveSuggestionIndex(
                activeSuggestionIndex <= 0 ? lastVisibleIndex : activeSuggestionIndex - 1,
              );
            } else if (event.key === "Enter" && activeSuggestion !== undefined) {
              event.preventDefault();
              selectSuggestion(activeSuggestion);
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
          autoFocus
          enterKeyHint="search"
          autoComplete="off"
          spellCheck="false"
        />
        {visibleSuggestions.length > 0 ? (
          <ul
            id={listId}
            className="suggestion-menu"
            role="listbox"
            aria-label="Suggestions"
            onScroll={revealMoreSuggestions}
          >
            {visibleSuggestions.map((item, index) => (
              <li
                id={`${listId}-${index}`}
                key={`${item.displayWord}-${item.headword}-${index}`}
                role="option"
                aria-selected={index === activeSuggestionIndex}
                aria-posinset={index + 1}
                aria-setsize={suggestions.length}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => selectSuggestion(item)}
              >
                <strong lang={/\p{Script=Cyrillic}/u.test(item.displayWord) ? "ru" : "sv"}>
                  {item.displayWord}
                </strong>
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      <div className="visually-hidden" role="status" aria-live="polite">
        {props.lookupState.kind === "loading" ? "Loading dictionary…" : null}
        {props.lookupState.kind === "unavailable-offline"
          ? "Connect once while online. After that, you can look up words offline."
          : null}
      </div>

      {library.length > 0 && dictionaryEntries !== null ? (
        <section className="word-library" aria-labelledby="lookup-library-heading">
          <h2 id="lookup-library-heading">Library</h2>
          <ul className="word-card-list" role="list">
            {library.map((item) => (
              <WordCard
                key={item.headword}
                item={item}
                entries={dictionaryEntries}
                expanded={expandedHeadword === item.headword}
                onToggle={toggleExpanded}
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
