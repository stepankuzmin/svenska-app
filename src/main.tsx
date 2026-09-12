import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import type { DictionaryAsset, DictionaryDetailsAsset } from "./dictionary-contract";
import {
  createSearch,
  isDictionaryAsset,
  isDictionaryDetailsAsset,
  type LookupOutcome,
} from "./dictionary";
import { dictionaryAssetUrl, dictionaryDetailsAssetUrl } from "./generated/dictionary-asset";
import {
  LookupPrototype,
  readPrototypeVariant,
} from "./lookup-prototype";
import "./styles.css";
import "./lookup-prototype.css";

type LookupState =
  | { kind: "loading" }
  | {
      kind: "ready";
      search: (query: string) => LookupOutcome;
      entries: DictionaryAsset["entries"];
      sourceEditionDate: string;
    }
  | { kind: "unavailable-offline" };

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
  const [query, setQuery] = useState(() =>
    import.meta.env.DEV ? new URLSearchParams(window.location.search).get("q") ?? "" : "",
  );
  const [lookupState, setLookupState] = useState<LookupState>({ kind: "loading" });
  const [dictionaryDetails, setDictionaryDetails] = useState<DictionaryDetailsAsset["entries"] | null>(null);
  const [libraryHeadwords, setLibraryHeadwords] = useState(() =>
    import.meta.env.DEV ? ["tack", "lagom", "hej"] : readLookupLibrary(),
  );
  const prototypeVariant = readPrototypeVariant();
  const outcome: LookupOutcome | null =
    lookupState.kind === "ready" && query.trim().length > 0 ? lookupState.search(query) : null;

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
        setLookupState({
          kind: "ready",
          search: createSearch({ dictionary: asset }),
          entries: asset.entries,
          sourceEditionDate: asset.metadata.sourceEditionDate,
        });

        if (import.meta.env.DEV) {
          void fetch(dictionaryDetailsAssetUrl)
            .then(async (response) => {
              if (!response.ok) {
                throw new Error("Dictionary details could not be loaded.");
              }
              return response.json();
            })
            .then((details) => {
              if (
                isDictionaryDetailsAsset(details) &&
                details.sourceEditionDate === asset.metadata.sourceEditionDate
              ) {
                setDictionaryDetails(details.entries);
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {
        if (!navigator.onLine) {
          setLookupState({ kind: "unavailable-offline" });
        }
      });
  }, []);

  function openLookup(lookupQuery: string) {
    if (lookupState.kind !== "ready") {
      return;
    }

    const nextOutcome = lookupState.search(lookupQuery);
    if (nextOutcome.kind === "result") {
      addToLibrary(nextOutcome.headword);
    }
  }

  function addToLibrary(headword: string) {
    setLibraryHeadwords((currentHeadwords) => {
      const nextHeadwords = [headword, ...currentHeadwords.filter((item) => item !== headword)];
      if (!import.meta.env.DEV) {
        writeLookupLibrary(nextHeadwords);
      }
      return nextHeadwords;
    });
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
      if (!import.meta.env.DEV) {
        writeLookupLibrary(nextHeadwords);
      }
      return nextHeadwords;
    });
  }

  function clearLibrary() {
    if (!window.confirm("Clear every word from your lookup library?")) {
      return;
    }

    if (!import.meta.env.DEV) {
      writeLookupLibrary([]);
    }
    setLibraryHeadwords([]);
  }

  if (import.meta.env.DEV) {
    return (
      <LookupPrototype
        variant={prototypeVariant}
        query={query}
        lookupState={lookupState}
        outcome={outcome}
        entries={lookupState.kind === "ready" ? lookupState.entries : null}
        details={dictionaryDetails}
        libraryHeadwords={libraryHeadwords}
        onQueryChange={setQuery}
        onSubmit={submit}
        onSelectSuggestion={selectChoice}
      />
    );
  }

  return (
    <main className="production-app">
      <header>
        <p className="eyebrow">Svenska.app</p>
        <h1>Swedish–Russian lookup</h1>
        <a href="#lookup-library">Library</a>
      </header>
      <form className="search" onSubmit={submit} method="get">
        <label htmlFor="dictionary-query">Swedish or Russian word</label>
        <div className="search-row">
          <input
            id="dictionary-query"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
            enterKeyHint="search"
            autoComplete="off"
            spellCheck="false"
          />
          <button type="submit" disabled={lookupState.kind !== "ready"}>Look up</button>
        </div>
      </form>
      <section className="lookup">
        <div className="status" role="status" aria-live="polite">
          {lookupState.kind === "loading" ? <p>Loading dictionary…</p> : null}
          {lookupState.kind === "unavailable-offline" ? (
            <p>Connect once while online. After that, you can look up words offline.</p>
          ) : null}
        </div>
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
                  <button
                    type="button"
                    aria-label={`${choice.headword}, ${choice.translation}`}
                    onClick={() => selectChoice(choice.headword)}
                  >
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
      <section className="library" id="lookup-library" aria-labelledby="lookup-library-heading">
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
      <footer>
        <p>
          Dictionary data from <strong>Lexin</strong>, published by the{" "}
          <strong>Institute for Language and Folklore (ISOF)</strong>.
        </p>
        {lookupState.kind === "ready" ? <p>Source edition: {lookupState.sourceEditionDate}</p> : null}
        <p>
          Licensed under{" "}
          <a href="https://creativecommons.org/licenses/by/4.0/">
            Creative Commons Attribution 4.0 (CC BY 4.0)
          </a>
          .
        </p>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<LookupApp />);
