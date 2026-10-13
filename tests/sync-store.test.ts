import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibraryStore } from "../src/sync/store";
import { recordsOf } from "../src/sync/model";
const whale = { headword: "val", word: "18439" };
const election = { headword: "val", word: "18440" };
const stores: LibraryStore[] = [];
function create(name = crypto.randomUUID(), seed = [whale]) {
  const store = new LibraryStore(name, seed, false, false);
  stores.push(store);
  return store;
}
afterEach(async () => { await Promise.all(stores.splice(0).map((store) => store.close())); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("durable local library", () => {
  it("starts remote reconciliation when another tab connects the stored library", async () => {
    const name = crypto.randomUUID();
    const local = new LibraryStore(name, [], false, true); stores.push(local);
    await local.ready;
    const remote = { flush: vi.fn(), connect: vi.fn(), disconnect: vi.fn() };
    const start = vi.spyOn(local, "startRemote").mockResolvedValue(remote);
    const connecting = create(name, []); await connecting.ready;
    await connecting.accept({ ...connecting.state().snapshot, libraryId: "shared", revision: 1 });
    await local.reload();
    expect(start).toHaveBeenCalledOnce();
    expect(local.getSnapshot().connected).toBe(true);
  });
  it("migrates a legacy library once and ignores subsequent legacy edits", async () => {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(["val"]), setItem: vi.fn() });
    const name = crypto.randomUUID();
    const store = new LibraryStore(name, undefined, false, false); stores.push(store);
    await store.ready;
    expect(store.getSnapshot().words).toEqual([{ headword: "val", word: "" }]);
    await store.enqueue("open", [election]);
    const reopened = create(name, []); await reopened.ready;
    expect(reopened.getSnapshot().words).toEqual([election, { headword: "val", word: "" }]);
  });
  it("stores words and their pending operations atomically and survives reopening", async () => {
    const name = crypto.randomUUID();
    const store = create(name); await store.ready;
    const listener = vi.fn(); const unsubscribe = store.subscribe(listener);
    await store.enqueue("open", [election]);
    await store.remove("val#18439", null);
    unsubscribe();
    expect(listener).toHaveBeenCalled();
    const reopened = create(name, []); await reopened.ready;
    expect(reopened.getSnapshot().words).toEqual([election]);
    expect(reopened.state().pending.map((operation) => operation.kind)).toEqual(["open", "remove"]);
    expect(reopened.state().sequence).toBe(2);
  });
  it("serializes sequences across independent tabs", async () => {
    const name = crypto.randomUUID();
    const first = create(name); const second = create(name); await Promise.all([first.ready, second.ready]);
    await Promise.all([first.enqueue("open", [whale]), second.enqueue("open", [election])]);
    await first.reload();
    expect(first.state().pending.map((operation) => operation.sequence)).toEqual([1, 2]);
    expect(first.getSnapshot().words).toHaveLength(2);
  });
  it("receives a snapshot without dropping local changes made during a request", async () => {
    const store = create(); await store.ready;
    await store.enqueue("open", [election]);
    await store.accept({ ...store.state().snapshot, libraryId: "shared", revision: 1, acknowledged: 0, records: recordsOf([whale]) });
    expect(store.getSnapshot().connected).toBe(true);
    expect(store.getSnapshot().words).toEqual([election, whale]);
    await store.accept({ ...store.state().snapshot, revision: 2, acknowledged: 1, records: recordsOf([election, whale]) });
    expect(store.state().pending).toEqual([]);
    await store.detach();
    expect(store.getSnapshot().connected).toBe(false);
    expect(store.getSnapshot().words).toEqual([election, whale]);
  });
  it("removes a displayed alias using its original persisted identity", async () => {
    const stale = { headword: "val", word: "9" };
    const store = create(undefined, [stale]); await store.ready;
    await store.remove("val#18439", {
      entries: { val: [{ word: "18439", partOfSpeech: "", meaning: "", translation: "" }] },
      wordAliases: { "val#9": "18439" },
    });
    expect(store.getSnapshot().words).toEqual([]);
    expect(store.state().pending[0].words).toEqual([stale, whale]);
  });
  it("normalizes spelling-only and aliased words before connecting, without opening or reordering them", async () => {
    const legacy = { headword: "val", word: "" };
    const store = create(undefined, [legacy]); await store.ready;
    expect(store.getSnapshot().readyForSync).toBe(false);
    expect(() => store.connectionWords()).toThrow("Wait for the dictionary");
    store.setDictionary({
      entries: { val: [whale, election].map(({ word }) => ({ word, partOfSpeech: "", meaning: "", translation: "" })) },
      wordAliases: {},
    });
    expect(store.getSnapshot().readyForSync).toBe(true);
    expect(store.connectionWords()).toEqual([whale, election]);
    expect(store.state().pending).toEqual([]);
    expect(store.state().sequence).toBe(0);
  });
  it("removes one meaning from a legacy spelling while retaining its siblings and order", async () => {
    const tea = { headword: "te", word: "123" };
    const legacy = { headword: "val", word: "" };
    const store = create(undefined, [tea, legacy]); await store.ready;
    await store.remove("val#18439", {
      entries: { val: [whale, election].map(({ word }) => ({ word, partOfSpeech: "", meaning: "", translation: "" })) },
      wordAliases: {},
    });
    expect(store.getSnapshot().words).toEqual([tea, election]);
    expect(store.state().pending[0].retained).toEqual([{ source: legacy, word: election }]);
  });
  it("keeps every unsaved lookup visible after quota failure without changing the saved copy", async () => {
    const name = crypto.randomUUID();
    const store = create(name); await store.ready;
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("No space", "QuotaExceededError");
    });
    await store.enqueue("open", [election]);
    await store.enqueue("open", [{ headword: "te", word: "123" }]);
    await store.reload();
    expect(store.getSnapshot().words).toEqual([{ headword: "te", word: "123" }, election, whale]);
    expect(store.getSnapshot().durable).toBe(false);
    expect(store.getSnapshot().status).toBe("error");
    put.mockRestore();
    const reopened = create(name, []); await reopened.ready;
    expect(reopened.getSnapshot().words).toEqual([whale]);
    expect(reopened.getSnapshot().durable).toBe(true);
  });
  it("keeps a visible in-memory library when persistence cannot open", async () => {
    vi.stubGlobal("indexedDB", { open: () => { throw new Error("Storage unavailable"); } });
    const store = new LibraryStore(crypto.randomUUID(), [whale], false, false);
    await store.ready;
    expect(store.getSnapshot().words).toEqual([whale]);
    expect(store.getSnapshot().status).toBe("error");
    await store.enqueue("open", [election]);
    expect(store.getSnapshot().error).toContain("cannot be saved");
    expect(store.getSnapshot().words).toEqual([election, whale]);
  });
});
