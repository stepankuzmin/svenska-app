import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import type { DictionaryAsset, DictionaryDetailsAsset } from "./dictionary-contract";
import type { LookupOutcome } from "./dictionary";
import { dictionaryAssetUrl, dictionaryDetailsAssetUrl } from "./generated/dictionary-asset";
import { LookupExperience } from "./lookup-experience";
import { isList, pastedLinesOf } from "./lookup-session";
import { useLookupSession } from "./use-lookup-session";
const SyncControl = lazy(() => import("./sync-control").catch(() => ({ default: () => <></> })));
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

const linkedText = new URLSearchParams(location.search).getAll("q").join("\n");

function LookupApp() {
  const { session, dispatch, storageError } = useLookupSession({ initialQuery: isList(linkedText) ? "" : linkedText });
  const [lookupState, setLookupState] = useState<LookupState>({ kind: "loading" });
  const [dictionaryDetails, setDictionaryDetails] = useState<DictionaryDetailsAsset["entries"] | null>(null);
  const [pendingLookup, setPendingLookup] = useState(linkedText);
  const { query } = session;
  const outcome = useMemo<LookupOutcome | null>(
    () => (lookupState.kind === "ready" ? lookupState.search(query) : null),
    [lookupState, query],
  );

  useEffect(() => {
    async function loadAsset(url: string): Promise<unknown> {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Dictionary unavailable.");
      }
      return response.json();
    }

    async function load() {
      const detailsRequest = loadAsset(dictionaryDetailsAssetUrl).catch(() => null);
      const [asset, { createSearch, hasDictionaryAssetShape, hasDictionaryDetailsShape }] = await Promise.all([loadAsset(dictionaryAssetUrl), import("./dictionary-search")]);
      if (!hasDictionaryAssetShape(asset)) {
        throw new Error("Dictionary unavailable.");
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

  // A ?q= link or a pasted list waits here for the dictionary. A link naming
  // one word opens its exact match the way submitting the field does, so an
  // iOS Shortcut can hand the app a word and land on the card.
  useEffect(() => {
    if (lookupState.kind !== "ready" || pendingLookup.length === 0) {
      return;
    }

    setPendingLookup("");
    dispatch(isList(pendingLookup)
      ? { kind: "pasted", pastedList: pastedLinesOf(pendingLookup, lookupState.search) }
      : { kind: "deep-linked", outcome: lookupState.search(pendingLookup) });
  }, [lookupState, pendingLookup]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch({ kind: "submitted", outcome });
  }

  return (
    <LookupExperience
      syncControl={<Suspense fallback={null}><SyncControl /></Suspense>}
      query={query}
      status={lookupState.kind}
      storageError={storageError}
      outcome={outcome}
      entries={lookupState.kind === "ready" ? lookupState.entries : null}
      details={dictionaryDetails}
      libraryWords={session.libraryWords}
      expandedCard={session.expandedCard}
      opens={session.opens}
      pastedList={session.pastedList}
      onQueryChange={(nextQuery) => dispatch({ kind: "query-changed", query: nextQuery })}
      onPasteList={setPendingLookup}
      onSubmit={submit}
      onSelectSuggestion={(choice) => dispatch({ kind: "picked", choice })}
      onToggleCard={(card) => dispatch({ kind: "card-toggled", card })}
      onRemoveWord={(card) => dispatch({ kind: "word-removed", card })}
    />
  );
}

createRoot(document.getElementById("root")!).render(<LookupApp />);
