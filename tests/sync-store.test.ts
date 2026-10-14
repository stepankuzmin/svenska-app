import "fake-indexeddb/auto";
import { openDB } from "idb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryStore } from "../src/sync/store";
import { recordsOf } from "../src/sync/model";
const whale = { headword: "val", word: "18439" };
const election = { headword: "val", word: "18440" };
const stores: LibraryStore[] = [];
const transport = vi.hoisted(() => ({ flush: vi.fn(() => Promise.resolve()), connect: vi.fn(), disconnect: vi.fn(), dispose: vi.fn() }));
const transportFactory = vi.hoisted(() => vi.fn());
vi.mock("../src/sync/load-transport", () => ({ loadTransport: () => Promise.resolve({ createRemote: transportFactory }) }));
beforeEach(() => { transportFactory.mockReset().mockReturnValue(transport); transport.flush.mockClear(); });
function create(name = crypto.randomUUID(), seed = [whale]) {
  const store = new LibraryStore(name, seed, false, false);
  stores.push(store);
  return store;
}
afterEach(async () => { await Promise.all(stores.splice(0).map((store) => store.close())); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("durable local library", () => {
  it("folds unpaired lookups into the snapshot across tabs without growing an outbox", async () => {
    const name = crypto.randomUUID();
    const first = create(name); const second = create(name); await Promise.all([first.ready, second.ready]);
    for (let index = 0; index < 100; index++) await (index % 2 ? first : second).enqueue("open", [election]);
    await first.remove("val#18439", null);
    const reopened = create(name, []); await reopened.ready;
    expect(reopened.state().pending).toEqual([]);
    expect(reopened.state().snapshot.records).toHaveLength(1);
    expect(reopened.state().sequence).toBe(101);
    expect(reopened.getSnapshot().words).toEqual([election]);
  });
  it("migrates the outbox saved by an older unpaired app", async () => {
    const name = crypto.randomUUID();
    const original = create(name); await original.ready;
    const database = await openDB(name, 1);
    try {
      await database.put("library", {
        snapshot: original.state().snapshot, sequence: 2,
        pending: [
          { sequence: 1, baseRevision: 0, kind: "open", words: [election] },
          { sequence: 2, baseRevision: 0, kind: "remove", words: [whale] },
        ],
      }, "current");
    } finally { database.close(); }
    const reopened = create(name, []); await reopened.ready;
    expect(reopened.state().pending).toEqual([]);
    expect(reopened.state().sequence).toBe(2);
    expect(reopened.state().snapshot.acknowledged).toBe(2);
    expect(reopened.getSnapshot().words).toEqual([election]);
  });
  it("imports the captured library and preserves cross-tab changes during a delayed connection", async () => {
    const name = crypto.randomUUID();
    const connecting = create(name); const editing = create(name); await Promise.all([connecting.ready, editing.ready]);
    await editing.enqueue("open", [election]);
    await navigator.locks.request("svenska-library-sync", async () => {
      const captured = await connecting.beginConnection();
      expect(captured.pending).toEqual([]);
      expect(connecting.getSnapshot().words).toEqual([election, whale]);
      const tea = { headword: "te", word: "123" };
      await editing.enqueue("open", [tea]);
      await editing.remove("val#18439", null);
      await connecting.accept({ ...captured.snapshot, libraryId: "shared", revision: 1, acknowledged: captured.sequence }, captured);
      expect(connecting.getSnapshot().words).toEqual([tea, election]);
      expect(connecting.state().pending.map((operation) => operation.sequence)).toEqual([2, 3]);
      await connecting.accept({ ...connecting.state().snapshot, revision: 3, acknowledged: 3, records: recordsOf([tea, election]) });
      expect(connecting.state().pending).toEqual([]);
    });
  });
  it("keeps uncertain pairing changes after its Web Lock is released", async () => {
    const name = crypto.randomUUID();
    const pairing = create(name); await pairing.ready;
    await navigator.locks.request("svenska-library-sync", async () => {
      await pairing.beginConnection();
      await pairing.enqueue("open", [election]);
      const editing = create(name, []); await editing.ready;
      expect(editing.state().pending).toHaveLength(1);
    });
    const reopened = create(name, []); await reopened.ready;
    expect(reopened.state().connectionSequence).toBe(0);
    expect(reopened.state().pending.map((operation) => operation.sequence)).toEqual([1]);
    expect(reopened.getSnapshot().words).toEqual([election, whale]);
    await reopened.enqueue("open", [whale]);
    expect(reopened.state().pending.map((operation) => operation.sequence)).toEqual([1, 2]);
    expect(reopened.getSnapshot().words).toEqual([whale, election]);
  });
  it("keeps paired offline changes when an old pairing response arrives", async () => {
    const store = create(); await store.ready;
    const old = await store.beginConnection();
    await store.detach();
    await store.accept({ ...store.state().snapshot, libraryId: "new" });
    await store.enqueue("open", [election]);
    expect(await store.accept({ ...old.snapshot, libraryId: "old" }, old)).toBe(false);
    expect(store.state().pending).toHaveLength(1);
    expect(store.getSnapshot().words).toEqual([election, whale]);
  });
  it("rejects a delayed snapshot from before another tab detached and edited the library", async () => {
    const name = crypto.randomUUID();
    const first = create(name); const second = create(name); await Promise.all([first.ready, second.ready]);
    await first.accept({ ...first.state().snapshot, libraryId: "shared", acknowledged: 10 });
    const expected = first.state();
    await second.detach();
    const tea = { headword: "te", word: "123" };
    await second.enqueue("open", [tea]);
    expect(await first.accept({ ...expected.snapshot, revision: 11, records: [] }, expected)).toBe(false);
    expect(first.getSnapshot().connected).toBe(false);
    expect(first.getSnapshot().words).toEqual([tea, whale]);
    expect(first.state().sequence).toBe(1);
  });
  it("keeps storage healthy and continues saving lookups after snapshot validation fails", async () => {
    const store = create(); await store.ready;
    await expect(store.accept({ ...store.state().snapshot, protocol: 2 as 1 })).rejects.toThrow("Update the app");
    expect(store.getSnapshot().durable).toBe(true);
    expect(store.getSnapshot().error).toBe("");
    await store.accept({ ...store.state().snapshot, libraryId: "shared" });
    await store.enqueue("open", [election]);
    expect(store.state().pending).toHaveLength(1);
    expect(store.getSnapshot().durable).toBe(true);
  });
  it("invalidates a revoked transport and flushes its replacement on shared-state reload", async () => {
    const name = crypto.randomUUID();
    const store = new LibraryStore(name, [], false, true); stores.push(store); await store.ready;
    await store.accept({ ...store.state().snapshot, libraryId: "shared", revision: 1 });
    const old = await store.startRemote();
    const replacement = { ...transport, flush: vi.fn(() => Promise.resolve()) };
    transportFactory.mockReturnValue(replacement);
    expect(store.remoteRevoked(old)).toBe(true);
    store.setStatus("revoked");
    await store.reload();
    await expect.poll(() => replacement.flush.mock.calls.length).toBe(1);
    expect(await store.startRemote()).toBe(replacement);
    expect(store.remoteRevoked(old)).toBe(false);
  });
  it("flushes an existing dormant transport when another tab connects", async () => {
    const name = crypto.randomUUID();
    const local = new LibraryStore(name, [], false, true); stores.push(local); await local.ready;
    await local.startRemote();
    expect(transport.flush).not.toHaveBeenCalled();
    const connecting = create(name, []); await connecting.ready;
    await connecting.accept({ ...connecting.state().snapshot, libraryId: "shared", revision: 1 });
    await local.reload();
    await expect.poll(() => transport.flush.mock.calls.length).toBe(1);
    expect(transportFactory).toHaveBeenCalledOnce();
  });
  it("clears a failed transport import and automatically retries without losing pending changes", async () => {
    const store = new LibraryStore(crypto.randomUUID(), [], false, true); stores.push(store); await store.ready;
    await navigator.locks.request("svenska-library-sync", async () => {
      await store.beginConnection();
      await store.enqueue("open", [whale]);
      await store.accept({ ...store.state().snapshot, libraryId: "shared", revision: 1, records: [] });
    });
    vi.useFakeTimers();
    transportFactory.mockImplementationOnce(() => { throw new Error("Chunk unavailable"); });
    await expect(store.startRemote()).rejects.toThrow("Chunk unavailable");
    await vi.advanceTimersByTimeAsync(1000);
    expect(await store.startRemote()).toBe(transport);
    expect(transportFactory).toHaveBeenCalledTimes(2);
    expect(store.state().pending).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("marks failed snapshot commits as storage errors and retains the saved outbox", async () => {
    const name = crypto.randomUUID();
    const store = create(name); await store.ready;
    await store.accept({ ...store.state().snapshot, libraryId: "shared" });
    await store.enqueue("open", [election]);
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => { throw new DOMException("No space", "QuotaExceededError"); });
    await expect(store.accept({ ...store.state().snapshot, libraryId: "shared", revision: 1, acknowledged: 1 })).rejects.toThrow("No space");
    expect(store.getSnapshot().durable).toBe(false);
    expect(store.getSnapshot().status).toBe("error");
    expect(store.state().snapshot.revision).toBe(0);
    expect(store.state().pending).toHaveLength(1);
    put.mockRestore();
    const reopened = create(name, []); await reopened.ready;
    expect(reopened.state().pending).toHaveLength(1);
    expect(reopened.getSnapshot().words).toEqual([election, whale]);
  });
  it("reports a closed database as a storage failure instead of a network outage", async () => {
    const store = create(); await store.ready; await store.close();
    await expect(store.reload()).rejects.toThrow();
    expect(store.getSnapshot().durable).toBe(false);
    expect(store.getSnapshot().status).toBe("error");
    expect(store.getSnapshot().words).toEqual([whale]);
  });
  it("starts remote reconciliation when another tab connects the stored library", async () => {
    const name = crypto.randomUUID();
    const local = new LibraryStore(name, [], false, true); stores.push(local);
    await local.ready;
    const remote = { flush: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), dispose: vi.fn() };
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
    await store.accept({ ...store.state().snapshot, libraryId: "shared" });
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
    await first.accept({ ...first.state().snapshot, libraryId: "shared" });
    await Promise.all([first.enqueue("open", [whale]), second.enqueue("open", [election])]);
    await first.reload();
    expect(first.state().pending.map((operation) => operation.sequence)).toEqual([1, 2]);
    expect(first.getSnapshot().words).toHaveLength(2);
  });
  it("receives a snapshot without dropping local changes made during a request", async () => {
    const store = create(); await store.ready;
    await store.accept({ ...store.state().snapshot, libraryId: "shared" });
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
    await store.accept({ ...store.state().snapshot, libraryId: "shared" });
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
    await store.accept({ ...store.state().snapshot, libraryId: "shared" });
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
