import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { z } from "zod";
import type { DictionaryAsset, DictionaryDetailsAsset } from "./dictionary-contract";
import {
  createSearch,
  hasDictionaryAssetShape,
  hasDictionaryDetailsShape,
  type LookupOutcome,
} from "./dictionary";
import { dictionaryAssetUrl, dictionaryDetailsAssetUrl } from "./generated/dictionary-asset";
import { LookupExperience } from "./lookup-experience";
import { normalizeLookupText } from "./normalize-lookup-text";
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

function readDeepLinkQuery(): string {
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

function prefersMotion(): boolean {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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
  const [query, setQuery] = useState(readDeepLinkQuery);
  const [deepLinkHeadword, setDeepLinkHeadword] = useState<string | null>(null);
  const pendingDeepLinkQuery = useRef(readDeepLinkQuery());
  const [lookupState, setLookupState] = useState<LookupState>({ kind: "loading" });
  const [dictionaryDetails, setDictionaryDetails] = useState<DictionaryDetailsAsset["entries"] | null>(null);
  const [libraryHeadwords, setLibraryHeadwords] = useState(readLookupLibrary);
  const outcome = useMemo<LookupOutcome | null>(
    () => (lookupState.kind === "ready" && query.trim().length > 0 ? lookupState.search(query) : null),
    [lookupState, query],
  );

  useEffect(() => {
    async function loadAsset(url: string): Promise<unknown> {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${url} responded ${response.status}.`);
      }
      return response.json();
    }

    async function load() {
      const asset = await loadAsset(dictionaryAssetUrl);
      if (!hasDictionaryAssetShape(asset)) {
        throw new Error("Dictionary asset has an invalid format.");
      }
      setLookupState({
        kind: "ready",
        search: createSearch({ dictionary: asset }),
        entries: asset.entries,
      });

      // Details carry examples and inflections; lookup works without them.
      const details = await loadAsset(dictionaryDetailsAssetUrl).catch(() => null);
      if (
        hasDictionaryDetailsShape(details) &&
        details.sourceEditionDate === asset.metadata.sourceEditionDate
      ) {
        setDictionaryDetails(details.entries);
      }
    }

    load().catch(() => {
      if (!navigator.onLine) {
        setLookupState({ kind: "unavailable-offline" });
      }
    });
  }, []);

  // A ?q= link opens its exact match the way submitting the field does, so an
  // iOS Shortcut can hand the app a word and land on the card.
  useEffect(() => {
    if (lookupState.kind !== "ready" || pendingDeepLinkQuery.current.length === 0) {
      return;
    }

    const lookupQuery = pendingDeepLinkQuery.current;
    pendingDeepLinkQuery.current = "";
    const deepLinkOutcome = lookupState.search(lookupQuery);
    if (deepLinkOutcome.kind === "result") {
      setDeepLinkHeadword(deepLinkOutcome.headword);
      addToLibrary([deepLinkOutcome.headword]);
      return;
    }

    // A word like "fika" indexes several headwords, so an exact link opens all
    // of them the way choosing that suggestion does.
    const [closestChoice] = deepLinkOutcome.kind === "choices" ? deepLinkOutcome.choices : [];
    if (
      closestChoice === undefined ||
      normalizeLookupText(closestChoice.displayWord) !== normalizeLookupText(lookupQuery)
    ) {
      return;
    }

    setDeepLinkHeadword(closestChoice.headwords[0] ?? null);
    addToLibrary(closestChoice.headwords);
  }, [lookupState]);

  function addToLibrary(headwords: readonly string[]) {
    const apply = () => {
      setLibraryHeadwords((currentHeadwords) => {
        const nextHeadwords = [
          ...headwords,
          ...currentHeadwords.filter((item) => !headwords.includes(item)),
        ];
        writeLookupLibrary(nextHeadwords);
        return nextHeadwords;
      });
    };

    if (!prefersMotion() || typeof document.startViewTransition !== "function") {
      apply();
      return;
    }

    document.startViewTransition(() => flushSync(apply));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (outcome?.kind === "result") {
      addToLibrary([outcome.headword]);
    }
  }

  function selectChoice({
    headwords,
    displayQuery,
  }: {
    headwords: readonly string[];
    displayQuery: string;
  }) {
    setQuery(displayQuery);
    addToLibrary(headwords);
  }

  return (
    <LookupExperience
      query={query}
      status={lookupState.kind}
      outcome={outcome}
      entries={lookupState.kind === "ready" ? lookupState.entries : null}
      details={dictionaryDetails}
      libraryHeadwords={libraryHeadwords}
      deepLinkHeadword={deepLinkHeadword}
      onQueryChange={setQuery}
      onSubmit={submit}
      onSelectSuggestion={selectChoice}
    />
  );
}

createRoot(document.getElementById("root")!).render(<LookupApp />);
