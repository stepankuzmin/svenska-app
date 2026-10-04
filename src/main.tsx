import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import type { DictionaryAsset, DictionaryDetailsAsset } from "./dictionary-contract";
import {
  createSearch,
  hasDictionaryAssetShape,
  hasDictionaryDetailsShape,
  type LookupOutcome,
} from "./dictionary";
import { dictionaryAssetUrl, dictionaryDetailsAssetUrl } from "./generated/dictionary-asset";
import { LookupExperience } from "./lookup-experience";
import { useLookupSession } from "./use-lookup-session";
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
  | { kind: "unavailable-offline" }
  | { kind: "failed" };

function readDeepLinkQuery(): string {
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

function LookupApp() {
  const { session, dispatch } = useLookupSession({ initialQuery: readDeepLinkQuery() });
  const pendingDeepLinkQuery = useRef(readDeepLinkQuery());
  const [lookupState, setLookupState] = useState<LookupState>({ kind: "loading" });
  const [dictionaryDetails, setDictionaryDetails] = useState<DictionaryDetailsAsset["entries"] | null>(null);
  const { query } = session;
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
      const detailsRequest = loadAsset(dictionaryDetailsAssetUrl).catch(() => null);
      const asset = await loadAsset(dictionaryAssetUrl);
      if (!hasDictionaryAssetShape(asset)) {
        throw new Error("Dictionary asset has an invalid format.");
      }
      setLookupState({
        kind: "ready",
        search: createSearch({ dictionary: asset }),
        entries: asset.entries,
      });
      dispatch({ kind: "dictionary-loaded", dictionary: asset });

      const details = await detailsRequest;
      if (
        hasDictionaryDetailsShape(details) &&
        details.sourceEditionDate === asset.metadata.sourceEditionDate
      ) {
        setDictionaryDetails(details.entries);
      }
    }

    load().catch(() => {
      setLookupState({ kind: navigator.onLine ? "failed" : "unavailable-offline" });
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
    dispatch({ kind: "deep-linked", outcome: lookupState.search(lookupQuery) });
  }, [lookupState]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch({ kind: "submitted", outcome });
  }

  return (
    <LookupExperience
      query={query}
      status={lookupState.kind}
      outcome={outcome}
      entries={lookupState.kind === "ready" ? lookupState.entries : null}
      details={dictionaryDetails}
      libraryWords={session.libraryWords}
      expandedCard={session.expandedCard}
      opens={session.opens}
      onQueryChange={(nextQuery) => dispatch({ kind: "query-changed", query: nextQuery })}
      onSubmit={submit}
      onSelectSuggestion={(choice) => dispatch({ kind: "picked", choice })}
      onToggleCard={(card) => dispatch({ kind: "card-toggled", card })}
      onRemoveWord={(card) => dispatch({ kind: "word-removed", card })}
    />
  );
}

createRoot(document.getElementById("root")!).render(<LookupApp />);
