import { flushSync } from "react-dom";
import { useRef, useState } from "react";
import type { DictionaryAsset } from "./dictionary-contract";
import { readLookupLibrary, writeLookupLibrary } from "./lookup-library";
import { reduceLookupSession, type LookupSession, type LookupSessionEvent } from "./lookup-session";

function withLibraryMotion(apply: () => void) {
  if (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    typeof document.startViewTransition !== "function"
  ) {
    apply();
    return;
  }

  document.startViewTransition(() => flushSync(apply));
}

// The session is plain state; this hook adds what the browser owns: the
// library persists on every change and moves its cards with a view transition.
// The transition starts a frame late, so only the library waits for it: the
// field and the extended card change at once, and a word typed meanwhile is
// not undone by the lookup that came before it.
export function useLookupSession({ initialQuery }: { initialQuery: string }) {
  const [session, setSession] = useState<LookupSession>(() => ({
    query: initialQuery,
    libraryWords: readLookupLibrary(),
    expandedCard: null,
    opens: 0,
  }));
  const latest = useRef({ session, entries: null as DictionaryAsset["entries"] | null });

  function dispatch(event: LookupSessionEvent) {
    const { session: current } = latest.current;
    if (event.kind === "dictionary-loaded") {
      latest.current.entries = event.dictionary.entries;
    }

    const next = reduceLookupSession({ session: current, event, entries: latest.current.entries });
    latest.current.session = next;
    if (next.libraryWords === current.libraryWords) {
      setSession(next);
      return;
    }

    writeLookupLibrary(next.libraryWords);
    const settle = () => setSession((shown) => ({ ...shown, libraryWords: next.libraryWords }));
    if (event.kind === "dictionary-loaded") {
      setSession(next);
      return;
    }

    setSession((shown) => ({ ...next, libraryWords: shown.libraryWords }));
    withLibraryMotion(settle);
  }

  return { session, dispatch };
}
