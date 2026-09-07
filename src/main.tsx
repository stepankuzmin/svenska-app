import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { createSearch, isDictionaryAsset, type LookupResult } from "./dictionary";
import { dictionaryAssetUrl } from "./generated/dictionary-asset";
import "./styles.css";

type SearchState =
  | { kind: "loading" }
  | { kind: "ready"; search: (query: string) => LookupResult | null }
  | { kind: "failed" };

function LookupApp() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [searchState, setSearchState] = useState<SearchState>({ kind: "loading" });

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
        setSearchState({ kind: "ready", search: createSearch({ dictionary: asset }) });
      })
      .catch(() => setSearchState({ kind: "failed" }));
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searchState.kind !== "ready") {
      return;
    }

    setResult(searchState.search(query));
    setSearched(true);
  }

  return (
    <main>
      <header>
        <p className="eyebrow">Svenska.app</p>
        <h1>Swedish–Russian lookup</h1>
      </header>
      <form onSubmit={submit} method="get">
        <label htmlFor="swedish-query">Swedish headword</label>
        <div className="search-row">
          <input
            id="swedish-query"
            name="q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            enterKeyHint="search"
            autoComplete="off"
            spellCheck="false"
          />
          <button type="submit" disabled={searchState.kind !== "ready"}>Look up</button>
        </div>
      </form>
      <section aria-live="polite" aria-atomic="true">
        {searchState.kind === "loading" ? <p>Loading dictionary…</p> : null}
        {searchState.kind === "failed" ? <p>Dictionary could not be loaded.</p> : null}
        {searched && result === null ? <p>No exact Swedish headword found.</p> : null}
        {result === null ? null : (
          <article>
            <h2>{result.headword}</h2>
            <ol>
              {result.senses.map((sense, index) => (
                <li key={`${sense.partOfSpeech}-${sense.meaning}-${index}`}>
                  <span>{sense.partOfSpeech}</span>
                  <p>{sense.translation}</p>
                  {sense.meaning.length > 0 ? <small>{sense.meaning}</small> : null}
                </li>
              ))}
            </ol>
          </article>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<LookupApp />);
