import { memo, useCallback, useMemo, useState, type FormEvent } from "react";
import type { DictionaryAsset, DictionaryDetailsAsset } from "./dictionary-contract";
import type { LookupChoice, LookupOutcome } from "./dictionary";
import { normalizeLookupText } from "./normalize-lookup-text";

// Three minimal word-card treatments, switchable with ?variant=, on the existing root route.
export type PrototypeVariant = "A" | "B" | "C";

type DictionarySense = DictionaryAsset["entries"][string][number];
type WordDetails = DictionaryDetailsAsset["entries"][string][number];

type PrototypeLookupState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "unavailable-offline" };

type LookupPrototypeProps = {
  variant: PrototypeVariant;
  query: string;
  lookupState: PrototypeLookupState;
  outcome: LookupOutcome | null;
  entries: DictionaryAsset["entries"] | null;
  details: DictionaryDetailsAsset["entries"] | null;
  libraryHeadwords: readonly string[];
  onQueryChange: (query: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSelectSuggestion: (headword: string) => void;
};

type WordItem = {
  headword: string;
  translation: string;
  senses: readonly DictionarySense[];
  details: readonly WordDetails[];
};

type RelatedWord = {
  headword: string;
  translation: string;
};

export function readPrototypeVariant(): PrototypeVariant {
  const variant = new URLSearchParams(window.location.search).get("variant");
  if (variant === "B" || variant === "C") {
    return variant;
  }
  return "A";
}

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
  query,
  entries,
  details,
}: {
  outcome: LookupOutcome | null;
  query: string;
  entries: DictionaryAsset["entries"] | null;
  details: DictionaryDetailsAsset["entries"] | null;
}): readonly WordItem[] {
  if (outcome === null || outcome.kind === "no-match" || entries === null) {
    return [];
  }

  if (outcome.kind === "choices") {
    const normalizedQuery = normalizeLookupText(query);
    const prefixMatches: LookupChoice[] = [];
    const otherMatches: LookupChoice[] = [];
    for (const choice of outcome.choices) {
      const startsWithQuery =
        normalizeLookupText(choice.headword).startsWith(normalizedQuery) ||
        normalizeLookupText(choice.translation).startsWith(normalizedQuery);
      const matches = startsWithQuery ? prefixMatches : otherMatches;
      if (matches.length < 6) {
        matches.push(choice);
      }
    }

    return [...prefixMatches, ...otherMatches]
      .slice(0, 6)
      .flatMap((choice) => {
        const senses = entries[choice.headword];
        return senses === undefined
          ? []
          : [{ ...choice, senses, details: details?.[choice.headword] ?? [] }];
      });
  }

  return [{
    headword: outcome.headword,
    translation: translationFor(outcome.senses),
    senses: outcome.senses,
    details: details?.[outcome.headword] ?? [],
  }];
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
      : [{ headword, translation: translationFor(senses), senses, details: details?.[headword] ?? [] }];
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
    related.set(normalizeLookupText(headword), { headword, translation: compound.russian });
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

function MinimalLookup(props: LookupPrototypeProps) {
  const suggestions = getSuggestionItems({
    outcome: props.outcome,
    query: props.query,
    entries: props.entries,
    details: props.details,
  });
  const library = useMemo(
    () => getLibraryItems(props.libraryHeadwords, props.entries, props.details),
    [props.libraryHeadwords, props.entries, props.details],
  );
  const inputId = `prototype-query-${props.variant.toLowerCase()}`;
  const listId = `prototype-suggestions-${props.variant.toLowerCase()}`;
  const placeholder = props.lookupState.kind === "loading"
    ? "Loading dictionary…"
    : "Swedish or Russian";
  const [autocompleteOpen, setAutocompleteOpen] = useState(props.query.trim().length > 0);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [expandedHeadword, setExpandedHeadword] = useState<string | null>(null);
  const visibleSuggestions = autocompleteOpen ? suggestions : [];
  const activeSuggestion = visibleSuggestions[activeSuggestionIndex];
  const dictionaryEntries = props.entries;

  function selectSuggestion(item: WordItem) {
    setAutocompleteOpen(false);
    setActiveSuggestionIndex(-1);
    setExpandedHeadword(item.headword);
    props.onSelectSuggestion(item.headword);
  }

  const toggleExpanded = useCallback((headword: string) => {
    setExpandedHeadword((currentHeadword) => currentHeadword === headword ? null : headword);
  }, []);

  return (
    <main className={`minimal-prototype minimal-${props.variant.toLowerCase()}`}>
      <form className="lookup-autocomplete" action="/" method="get" onSubmit={props.onSubmit}>
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
              setActiveSuggestionIndex((current) => (current + 1) % suggestions.length);
            } else if (event.key === "ArrowUp" && suggestions.length > 0) {
              event.preventDefault();
              setAutocompleteOpen(true);
              setActiveSuggestionIndex((current) =>
                current <= 0 ? suggestions.length - 1 : current - 1,
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
          <ul id={listId} className="suggestion-menu" role="listbox" aria-label="Suggestions">
            {visibleSuggestions.map((item, index) => (
              <li
                id={`${listId}-${index}`}
                key={`${item.headword}-${item.translation}-${index}`}
                role="option"
                aria-selected={index === activeSuggestionIndex}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => selectSuggestion(item)}
              >
                <strong lang="sv">{cleanLexinText(item.headword)}</strong>
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      {library.length > 0 && dictionaryEntries !== null ? (
        <section className="word-library" aria-labelledby="prototype-library-heading">
          <h2 id="prototype-library-heading">Library</h2>
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
    </main>
  );
}

export function LookupPrototype(props: LookupPrototypeProps) {
  return <MinimalLookup {...props} />;
}
