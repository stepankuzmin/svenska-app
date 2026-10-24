import { wordsOpenedBy, type LookupSessionEvent } from "../lookup-session";
import type { LibraryWord } from "../words";
import { libraryStore } from "./store";

export function createSessionBridge(onChange: (words: readonly LibraryWord[]) => void) {
  const store = libraryStore();
  let saving = 0;
  let shown: readonly LibraryWord[] | undefined;
  const refresh = () => {
    const { words } = store.getSnapshot();
    if (saving > 0 || words === shown) return;
    shown = words;
    onChange(words);
  };
  const unsubscribe = store.subscribe(refresh);
  void store.ready.then(refresh);
  return {
    dispatch(event: LookupSessionEvent) {
      if (event.kind === "dictionary-loaded") store.setDictionary(event.dictionary);
      else if (event.kind === "word-removed" || wordsOpenedBy(event).length > 0) {
        saving++;
        void store.dispatch(event).then(() => { saving--; shown = undefined; refresh(); });
      }
    },
    close: unsubscribe,
  };
}
