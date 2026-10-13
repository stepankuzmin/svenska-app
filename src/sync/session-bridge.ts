import type { LookupSessionEvent } from "../lookup-session";
import type { DictionaryAsset } from "../dictionary-contract";
import { resolveLibraryWords, type LibraryWord } from "../words";
import { libraryStore } from "./store";

export function createSessionBridge(onChange: (words: readonly LibraryWord[]) => void) {
  const store = libraryStore();
  let dictionary: Pick<DictionaryAsset, "entries" | "wordAliases"> | null = null;
  const refresh = () => {
    const words = store.getSnapshot().words;
    onChange(dictionary ? resolveLibraryWords({ libraryWords: words, dictionary }) : words);
  };
  const unsubscribe = store.subscribe(refresh);
  void store.ready.then(refresh);
  return {
    dispatch(event: LookupSessionEvent) {
      if (event.kind === "dictionary-loaded") {
        dictionary = event.dictionary;
        store.setDictionary(dictionary);
        refresh();
      } else void store.dispatch(event, dictionary);
    },
    close: unsubscribe,
  };
}
