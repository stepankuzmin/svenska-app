import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach, expect, it, vi } from "vitest";
import { wordKey, type LibraryWord } from "../src/words";

const whale = { headword: "val", word: "18439" };
const tea = { headword: "te", word: "123" };

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("indexedDB", new IDBFactory());
});

async function bridgeOver(seed: LibraryWord[]) {
  const saved = new Map([["svenska.lookup-library", JSON.stringify(seed)]]);
  vi.stubGlobal("localStorage", { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
  const { createSessionBridge } = await import("../src/sync/session-bridge");
  const { libraryStore } = await import("../src/sync/store");
  const shown: (readonly LibraryWord[])[] = [];
  const bridge = createSessionBridge((words) => shown.push(words));
  const store = libraryStore();
  await store.ready;
  bridge.dispatch({ kind: "dictionary-loaded", dictionary: { entries: {}, wordAliases: {} } });
  shown.length = 0;
  return { bridge, store, shown };
}

it("never shows a removed card again while the removal saves", async () => {
  const { bridge, shown } = await bridgeOver([whale, tea]);
  bridge.dispatch({ kind: "word-removed", card: wordKey(whale) });
  await expect.poll(() => shown).toEqual([[tea]]);
});

it("shows the saved library again when the store refuses an opening", async () => {
  const words = Array.from({ length: 20_000 }, (_, index) => ({ headword: `word-${index}`, word: String(index + 1) }));
  const { bridge, store, shown } = await bridgeOver(words);
  await store.accept({ ...store.state().snapshot, libraryId: "shared", revision: 1 });
  shown.length = 0;
  bridge.dispatch({ kind: "picked", choice: { word: tea } });
  await expect.poll(() => shown.length).toBe(1);
  expect(shown[0]).toHaveLength(20_000);
  expect(store.getSnapshot().error).toBe("This library is full. Remove a word before opening another.");
});
