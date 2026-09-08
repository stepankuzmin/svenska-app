import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import { createSearch, isDictionaryAsset, type LookupOutcome } from "./dictionary";
import { dictionaryAssetUrl } from "./generated/dictionary-asset";
import "./styles.css";

type LookupState =
  | { kind: "loading" }
  | { kind: "ready"; search: (query: string) => LookupOutcome }
  | { kind: "failed" };

const lookupLibraryStorageKey = "svenska.lookup-library";
const lookupLibrarySchema = z.array(z.string());

function readLookupLibrary(): readonly string[] {
  try {
    const storedLibrary: unknown = JSON.parse(localStorage.getItem(lookupLibraryStorageKey) ?? "[]");
    return lookupLibrarySchema.safeParse(storedLibrary).data ?? [];
  } catch {
    return [];
  }
}

function writeLookupLibrary(headwords: readonly string[]) {
  try {
    localStorage.setItem(lookupLibraryStorageKey, JSON.stringify(headwords));
  } catch {
    // Lookups still work when browser storage is unavailable.
  }
}

function LookupApp() {
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<LookupOutcome | null>(null);
  const [lookupState, setLookupState] = useState<LookupState>({ kind: "loading" });
  const [libraryHeadwords, setLibraryHeadwords] = useState(readLookupLibrary);

  useEffect(() => {
    fetch(dictionaryAssetUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Dictionary asset could not be loaded.");
        }
        return response.json();
      })
      .then((asset) => {
        if (!isDictionaryAsset(asset)) {
          throw new Error("Dictionary asset has an invalid format.");
        }
        setLookupState({ kind: "ready", search: createSearch({ dictionary: asset }) });
      })
      .catch(() => setLookupState({ kind: "failed" }));
  }, []);

  function openLookup(lookupQuery: string) {
    if (lookupState.kind !== "ready") {
      return;
    }

    const nextOutcome = lookupState.search(lookupQuery);
    setOutcome(nextOutcome);
    if (nextOutcome.kind === "result") {
      setLibraryHeadwords((currentHeadwords) => {
        const nextHeadwords = [
          nextOutcome.headword,
          ...currentHeadwords.filter((headword) => headword !== nextOutcome.headword),
        ];
        writeLookupLibrary(nextHeadwords);
        return nextHeadwords;
      });
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    openLookup(query);
  }

  function selectChoice(headword: string) {
    setQuery(headword);
    openLookup(headword);
  }

  function removeFromLibrary(headwordToRemove: string) {
    setLibraryHeadwords((currentHeadwords) => {
      const nextHeadwords = currentHeadwords.filter((headword) => headword !== headwordToRemove);
      writeLookupLibrary(nextHeadwords);
      return nextHeadwords;
    });
  }

  function clearLibrary() {
    if (!window.confirm("Clear every word from your lookup library?")) {
      return;
    }

    writeLookupLibrary([]);
    setLibraryHeadwords([]);
  }

  return (
    <main>
      <header>
        <p className="eyebrow">Svenska.app</p>
        <h1>Swedish–Russian lookup</h1>
        <a href="#lookup-library">Library</a>
      </header>
      <form onSubmit={submit} method="get">
        <label htmlFor="dictionary-query">Swedish or Russian word</label>
        <div className="search-row">
          <input
            id="dictionary-query"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            enterKeyHint="search"
            autoComplete="off"
            spellCheck="false"
          />
          <button type="submit" disabled={lookupState.kind !== "ready"}>Look up</button>
        </div>
      </form>
      <section aria-live="polite">
        {lookupState.kind === "loading" ? <p>Loading dictionary…</p> : null}
        {lookupState.kind === "failed" ? <p>Dictionary could not be loaded.</p> : null}
        {outcome?.kind === "no-match" ? (
          <div className="no-match">
            <h2>No matching word</h2>
            <p>Check the spelling or try a shorter Swedish or Russian word.</p>
          </div>
        ) : null}
        {outcome?.kind === "choices" ? (
          <div className="choices">
            <h2>Choose a word</h2>
            <ul>
              {outcome.choices.map((choice, index) => (
                <li key={`${choice.headword}-${choice.translation}-${index}`}>
                  <button type="button" onClick={() => selectChoice(choice.headword)}>
                    <strong lang="sv">{choice.headword}</strong>
                    <span lang="ru">{choice.translation}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {outcome?.kind === "result" ? (
          <article>
            <h2 lang="sv">{outcome.headword}</h2>
            <ol>
              {outcome.senses.map((sense, index) => (
                <li key={`${sense.partOfSpeech}-${sense.meaning}-${index}`}>
                  <span>{sense.partOfSpeech}</span>
                  <p lang="ru">{sense.translation}</p>
                  {sense.meaning.length > 0 ? <small>{sense.meaning}</small> : null}
                </li>
              ))}
            </ol>
          </article>
        ) : null}
      </section>
      <section id="lookup-library" aria-labelledby="lookup-library-heading">
        <div className="library-heading">
          <h2 id="lookup-library-heading">Lookup library</h2>
          {libraryHeadwords.length > 0 ? (
            <button className="library-clear" type="button" onClick={clearLibrary}>Clear library</button>
          ) : null}
        </div>
        {libraryHeadwords.length === 0 ? <p>Opened words will appear here.</p> : null}
        {lookupState.kind === "ready" && libraryHeadwords.length > 0 ? (
          <ul className="library-list">
            {libraryHeadwords.flatMap((headword) => {
              const libraryOutcome = lookupState.search(headword);
              if (libraryOutcome.kind !== "result") {
                return [];
              }

              const translation = [...new Set(libraryOutcome.senses.map((sense) => sense.translation))].join(" · ");
              return [
                <li key={headword}>
                  <button
                    className="library-entry"
                    type="button"
                    aria-label={`Open ${headword}, ${translation}`}
                    onClick={() => selectChoice(headword)}
                  >
                    <strong lang="sv">{headword}</strong>
                    <span lang="ru">{translation}</span>
                  </button>
                  <button
                    className="library-remove"
                    type="button"
                    aria-label={`Remove ${headword} from library`}
                    onClick={() => removeFromLibrary(headword)}
                  >
                    Remove
                  </button>
                </li>,
              ];
            })}
          </ul>
        ) : null}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<LookupApp />);
