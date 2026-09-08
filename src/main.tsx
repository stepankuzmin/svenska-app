import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { createSearch, isDictionaryAsset, type LookupOutcome } from "./dictionary";
import { dictionaryAssetUrl } from "./generated/dictionary-asset";
import "./styles.css";

type LookupState =
  | { kind: "loading" }
  | { kind: "ready"; search: (query: string) => LookupOutcome }
  | { kind: "failed" };

function LookupApp() {
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<LookupOutcome | null>(null);
  const [lookupState, setLookupState] = useState<LookupState>({ kind: "loading" });

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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lookupState.kind !== "ready") {
      return;
    }

    setOutcome(lookupState.search(query));
  }

  function selectChoice(headword: string) {
    if (lookupState.kind !== "ready") {
      return;
    }

    setQuery(headword);
    setOutcome(lookupState.search(headword));
  }

  return (
    <main>
      <header>
        <p className="eyebrow">Svenska.app</p>
        <h1>Swedish–Russian lookup</h1>
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
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<LookupApp />);
