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
import { resolveLibraryWords, wordKey, wordsOf, type LibraryWord } from "./words";
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
// A library written before the app kept words holds bare headwords.
const lookupLibrarySchema = z.array(z.union([
  z.object({ headword: z.string(), word: z.string() }),
  z.string().transform((headword) => ({ headword, word: "" })),
]));

function readLookupLibrary(): readonly LibraryWord[] {
  try {
    const storedLibrary: unknown = JSON.parse(localStorage.getItem(lookupLibraryStorageKey) ?? "[]");
    return lookupLibrarySchema.safeParse(storedLibrary).data ?? [];
  } catch {
    return [];
  }
}

function writeLookupLibrary(libraryWords: readonly LibraryWord[]) {
  try {
    localStorage.setItem(lookupLibraryStorageKey, JSON.stringify(libraryWords));
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
  const [libraryWords, setLibraryWords] = useState(readLookupLibrary);
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
      setLibraryWords((currentWords) => {
        const resolvedWords = resolveLibraryWords({ libraryWords: currentWords, entries: asset.entries });
        if (resolvedWords !== currentWords) {
          writeLookupLibrary(resolvedWords);
        }
        return resolvedWords;
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

    // A word like "fika" indexes several words, so an exact link opens all of
    // them rather than the one a suggestion would.
    const exactChoices = deepLinkOutcome.kind === "choices"
      ? deepLinkOutcome.choices.filter((choice) =>
          normalizeLookupText(choice.displayWord) === normalizeLookupText(lookupQuery))
      : [];
    const [closestChoice] = exactChoices;
    if (closestChoice === undefined) {
      return;
    }

    setDeepLinkHeadword(closestChoice.word.headword);
    addWordsToLibrary(exactChoices.map(({ word }) => word));
  }, [lookupState]);

  // A lookup opens a spelling, which can hold more than one word, and every
  // word it holds joins the library in its own right.
  function wordsOfHeadwords(headwords: readonly string[]): LibraryWord[] {
    const entries = lookupState.kind === "ready" ? lookupState.entries : {};
    return headwords.flatMap((headword) => {
      const senses = entries[headword];
      return senses === undefined
        ? [{ headword, word: "" }]
        : wordsOf({ headword, senses }).map(({ word }) => ({ headword, word }));
    });
  }

  // The library moves as one: a word joining it or leaving it carries the cards
  // around it to their new places.
  function withLibraryMotion(apply: () => void) {
    if (!prefersMotion() || typeof document.startViewTransition !== "function") {
      apply();
      return;
    }

    document.startViewTransition(() => flushSync(apply));
  }

  function removeFromLibrary(card: string) {
    withLibraryMotion(() => {
      setLibraryWords((currentWords) => {
        const nextWords = currentWords.filter((libraryWord) => wordKey(libraryWord) !== card);
        writeLookupLibrary(nextWords);
        return nextWords;
      });
    });
  }

  function addToLibrary(headwords: readonly string[]) {
    addWordsToLibrary(wordsOfHeadwords(headwords));
  }

  // Two index entries can lead to one word, as `вы` and `Вы` both lead to
  // `ni`, and the word joins the library once.
  function addWordsToLibrary(words: readonly LibraryWord[]) {
    const openedWords = [...new Map(words.map((word) => [wordKey(word), word])).values()];
    const openedKeys = openedWords.map(wordKey);
    const apply = () => {
      setLibraryWords((currentWords) => {
        const nextWords = [
          ...openedWords,
          ...currentWords.filter((item) => !openedKeys.includes(wordKey(item))),
        ];
        writeLookupLibrary(nextWords);
        return nextWords;
      });
    };

    withLibraryMotion(apply);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (outcome?.kind === "result") {
      addToLibrary([outcome.headword]);
    }
  }

  // A suggestion names one word, and that word alone joins the library.
  function selectChoice({ word, displayQuery }: { word: LibraryWord; displayQuery: string }) {
    setQuery(displayQuery);
    addWordsToLibrary([word]);
  }

  return (
    <LookupExperience
      query={query}
      status={lookupState.kind}
      outcome={outcome}
      entries={lookupState.kind === "ready" ? lookupState.entries : null}
      details={dictionaryDetails}
      libraryWords={libraryWords}
      deepLinkHeadword={deepLinkHeadword}
      onQueryChange={setQuery}
      onSubmit={submit}
      onSelectSuggestion={selectChoice}
      onRemoveWord={removeFromLibrary}
    />
  );
}

createRoot(document.getElementById("root")!).render(<LookupApp />);
