import { flushSync } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { readLookupLibrary } from "./lookup-library";
import { reduceLookupSession, type LookupSession, type LookupSessionEvent } from "./lookup-session";
import type { createSessionBridge } from "./sync/session-bridge";

function withLibraryMotion(apply: () => void) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof document.startViewTransition !== "function") {
    apply();
    return;
  }
  document.startViewTransition(() => flushSync(apply));
}

export function useLookupSession({ initialQuery }: { initialQuery: string }) {
  const [session, setSession] = useState<LookupSession>(() => ({
    query: initialQuery, libraryWords: readLookupLibrary(), expandedCard: null, opens: 0,
  }));
  const latest = useRef(session);
  const [storageError, setStorageError] = useState(false);
  const bridge = useRef<Promise<ReturnType<typeof createSessionBridge> | null> | null>(null);
  const active = useRef(true);

  function storage() {
    return bridge.current ??= import("./sync/session-bridge").then(({ createSessionBridge }) =>
      createSessionBridge((libraryWords) => {
        if (!active.current) return;
        latest.current = { ...latest.current, libraryWords };
        // React may replay this update after an urgent keystroke. Change only
        // the library so that a storage notification cannot restore old input.
        setSession((shown) => ({ ...shown, libraryWords }));
      }),
    ).catch(() => { if (active.current) setStorageError(true); return null; });
  }
  useEffect(() => {
    active.current = true;
    void storage();
    return () => {
      active.current = false;
      void bridge.current?.then((value) => value?.close());
      bridge.current = null;
    };
  }, []);

  function dispatch(event: LookupSessionEvent) {
    const current = latest.current;
    const next = reduceLookupSession({ session: current, event });
    latest.current = next;
    if (event.kind === "dictionary-loaded" || event.kind === "word-removed" || next.opens > current.opens) {
      void storage().then((value) => value?.dispatch(event));
    }
    if (next.libraryWords === current.libraryWords || event.kind === "dictionary-loaded") {
      setSession(next);
      return;
    }
    setSession((shown) => ({ ...next, libraryWords: shown.libraryWords }));
    withLibraryMotion(() => setSession((shown) => ({ ...shown, libraryWords: latest.current.libraryWords })));
  }
  return { session, dispatch, storageError };
}
