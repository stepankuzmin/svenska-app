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
import { LookupExperience } from "./lookup-experience";
import "./lookup-experience.css";

if ("serviceWorker" in navigator) {
  void navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
    .catch(() => {});
}

type LookupState =
  | { kind: "loading" }
  | {
      kind: "ready";
      search: (query: string) => LookupOutcome;
      entries: DictionaryAsset["entries"];
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
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "");
  const [lookupState, setLookupState] = useState<LookupState>({ kind: "loading" });
  const [dictionaryDetails, setDictionaryDetails] = useState<DictionaryDetailsAsset["entries"] | null>(null);
  const [libraryHeadwords, setLibraryHeadwords] = useState(readLookupLibrary);
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
        });

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
      writeLookupLibrary(nextHeadwords);
      return nextHeadwords;
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    openLookup(query);
  }

  function selectChoice({ headword, displayQuery }: { headword: string; displayQuery: string }) {
    setQuery(displayQuery);
    openLookup(headword);
  }

  return (
    <LookupExperience
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

createRoot(document.getElementById("root")!).render(<LookupApp />);
