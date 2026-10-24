import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibraryStore } from "../src/sync/store";
import { applyOperation, readOperations, readWords, recordsOf, visibleWords, type LibrarySnapshot, type SyncOperation } from "../src/sync/model";
import { createRemote, queryClient } from "../src/sync/remote";

vi.mock("../src/sync/load-transport", () => ({ loadTransport: () => import("../src/sync/remote") }));

let store: LibraryStore;
let remote: ReturnType<typeof createRemote>;
afterEach(async () => {
  vi.useRealTimers();
  if (remote) remote.dispose();
  if (store) await store.close();
  queryClient.clear(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("idle sync health checks", () => {
  it("checks a small revision instead of downloading unchanged snapshots, then fetches changed records", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal("document", { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal("location", { href: "https://example.test/" });
    vi.stubGlobal("WebSocket", class { close() {} });
    store = new LibraryStore(crypto.randomUUID(), [], false, false); await store.ready;
    let snapshot: LibrarySnapshot = { ...store.state().snapshot, libraryId: "shared", revision: 1, records: recordsOf([{ headword: "val", word: "18439" }]) };
    await store.accept(snapshot);
    const requested: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string) => {
      requested.push(path);
      return Response.json(path.endsWith("revision")
        ? { protocol: snapshot.protocol, revision: snapshot.revision, acknowledged: snapshot.acknowledged } : snapshot);
    }));
    remote = createRemote(store);
    await remote.flush();
    await vi.advanceTimersByTimeAsync(0);
    const previousChecks = requested.filter((path) => path.endsWith("revision")).length;
    const statuses = vi.spyOn(store, "setStatus");
    for (let index = 0; index < 5; index++) {
      await vi.advanceTimersByTimeAsync(30_000);
      await expect.poll(() => statuses.mock.calls.filter(([status]) => status === "synced").length).toBe(index + 1);
    }
    expect(requested.filter((path) => path.endsWith("library"))).toHaveLength(1);
    expect(requested.filter((path) => path.endsWith("revision"))).toHaveLength(previousChecks + 5);
    snapshot = { ...snapshot, revision: 2, records: recordsOf([{ headword: "fika", word: "4106" }]) };
    await vi.advanceTimersByTimeAsync(30_000);
    await remote.flush();
    expect(requested.filter((path) => path.endsWith("library"))).toHaveLength(2);
    expect(store.state().snapshot.revision).toBe(2);
    expect(visibleWords(store.state())).toEqual([{ headword: "fika", word: "4106" }]);
  });
  it("backs off reconnecting when the network keeps closing the WebSocket", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    browserGlobals();
    vi.stubGlobal("navigator", {});
    let sockets = 0;
    vi.stubGlobal("WebSocket", class {
      onclose: ((event: { code: number }) => void) | null = null;
      constructor() { sockets++; setTimeout(() => this.onclose?.({ code: 1006 }), 0); }
      close() {}
    });
    store = new LibraryStore(crypto.randomUUID(), [], false, false); await store.ready;
    const snapshot: LibrarySnapshot = { ...store.state().snapshot, libraryId: "shared", revision: 1 };
    await store.accept(snapshot);
    vi.stubGlobal("fetch", vi.fn(async (path: string) => Response.json(path.endsWith("revision")
      ? { protocol: snapshot.protocol, revision: snapshot.revision, acknowledged: snapshot.acknowledged } : snapshot)));
    remote = createRemote(store);
    await remote.flush();
    for (let second = 0; second < 60; second++) {
      await vi.advanceTimersByTimeAsync(1000);
      for (let tick = 0; tick < 20; tick++) await new Promise((resolve) => setImmediate(resolve));
    }
    expect(sockets).toBe(6);
  });

  it("sends an opening without downloading the library again", async () => {
    browserGlobals();
    vi.stubGlobal("navigator", {});
    store = new LibraryStore(crypto.randomUUID(), [], false, false); await store.ready;
    let snapshot: LibrarySnapshot = { ...store.state().snapshot, libraryId: "shared", revision: 1 };
    await store.accept(snapshot);
    const requested: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string, options?: RequestInit) => {
      requested.push(path);
      if (path.endsWith("operations")) {
        const { operations } = JSON.parse(String(options?.body)) as { operations: SyncOperation[] };
        snapshot = { ...snapshot, revision: 2, acknowledged: operations[0].sequence, records: applyOperation(snapshot.records, operations[0], snapshot.deviceId, 2) };
      }
      return Response.json(snapshot);
    }));
    remote = createRemote(store);
    await remote.flush();
    requested.length = 0;
    await store.enqueue("open", [{ headword: "te", word: "123" }]);
    await remote.flush();
    expect(requested).toEqual(["/api/sync/operations"]);
    expect(store.state().pending).toEqual([]);
  });

  it("stops polling the server from a hidden tab with an open WebSocket", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    browserGlobals();
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", { visibilityState: "hidden", addEventListener: vi.fn(), removeEventListener: vi.fn() });
    store = new LibraryStore(crypto.randomUUID(), [], false, false); await store.ready;
    const snapshot: LibrarySnapshot = { ...store.state().snapshot, libraryId: "shared", revision: 1 };
    await store.accept(snapshot);
    const fetch = vi.fn(async (path: string) => Response.json(path.endsWith("revision")
      ? { protocol: snapshot.protocol, revision: snapshot.revision, acknowledged: snapshot.acknowledged } : snapshot));
    vi.stubGlobal("fetch", fetch);
    remote = createRemote(store);
    await remote.flush();
    for (let minute = 0; minute < 10; minute++) {
      await vi.advanceTimersByTimeAsync(60_000);
      for (let tick = 0; tick < 20; tick++) await new Promise((resolve) => setImmediate(resolve));
    }
    expect(fetch.mock.calls.map(([path]) => path)).toEqual(["/api/sync/library", "/api/sync/revision"]);
  });
});

function browserGlobals(locks = navigator.locks) {
  vi.stubGlobal("navigator", { locks });
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("location", { href: "https://example.test/" });
  vi.stubGlobal("WebSocket", class { close() {} });
}

describe("connection lifecycle", () => {
  it("acknowledges a concurrent rejected opening and keeps syncing subsequent edits", async () => {
    browserGlobals();
    const words = Array.from({ length: 19_999 }, (_, index) => ({ headword: `word-${index}`, word: String(index + 1) }));
    const winner = { headword: "winner", word: "30000" };
    const loser = { headword: "loser", word: "30001" };
    store = new LibraryStore(crypto.randomUUID(), words, false, false); await store.ready;
    await store.accept({ ...store.state().snapshot, libraryId: "shared", revision: 1 });
    await store.enqueue("open", [loser]);
    let snapshot: LibrarySnapshot = { ...store.state().snapshot, revision: 2, records: recordsOf([...words, winner]) };
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string, options: RequestInit) => {
      if (options.signal) signals.push(options.signal);
      if (path.endsWith("operations")) {
        const operations = readOperations(JSON.parse(String(options.body)).operations);
        if (operations[0].sequence === 1) {
          snapshot = { ...snapshot, acknowledged: 1, rejectedOperation: { sequence: 1, message: "Library is full" } };
        } else {
          const { rejectedOperation: _rejected, ...accepted } = snapshot;
          snapshot = operations.reduce((state, operation) => ({
            ...state, revision: state.revision + 1, acknowledged: operation.sequence,
            records: applyOperation(state.records, operation, state.deviceId, state.revision + 1),
          }), accepted);
        }
      }
      return Response.json(path.endsWith("revision")
        ? { protocol: snapshot.protocol, revision: snapshot.revision, acknowledged: snapshot.acknowledged } : snapshot);
    }));
    remote = createRemote(store);
    await remote.flush();
    expect(store.state().pending).toEqual([]);
    expect(store.getSnapshot()).toMatchObject({ durable: true, status: "error", error: "Library is full" });
    expect(store.getSnapshot().words).not.toContainEqual(loser);
    await remote.flush();
    expect(store.getSnapshot().error).toBe("Library is full");
    await store.remove("word-0#1");
    await store.enqueue("open", [loser]);
    await remote.flush();
    expect(store.state().pending).toEqual([]);
    expect(store.state().snapshot.acknowledged).toBe(3);
    expect(store.getSnapshot()).toMatchObject({ status: "synced", error: "" });
    expect(store.getSnapshot().words).toHaveLength(20_000);
    expect(store.getSnapshot().words).toContainEqual(loser);
    expect(signals.every((signal) => !signal.aborted)).toBe(true);
  });

  it.each([403, 410, 422, 429])("compacts local changes after a definitive %i pairing rejection", async (status) => {
    browserGlobals();
    const whale = { headword: "val", word: "18439" };
    store = new LibraryStore(crypto.randomUUID(), [whale], false, false); await store.ready;
    store.setDictionary({ entries: {}, wordAliases: {} });
    const response = Promise.withResolvers<Response>();
    vi.stubGlobal("fetch", vi.fn(() => response.promise));
    remote = createRemote(store);
    const connecting = remote.connect("join", { libraryId: "shared", token: "invalid", label: "Browser" });
    const rejected = expect(connecting).rejects.toThrow("Rejected");
    await expect.poll(() => store.state().connectionSequence).toBe(0);
    await store.remove("val#18439");
    response.resolve(Response.json({ error: "Rejected" }, { status }));
    await rejected;
    expect(store.state().connectionSequence).toBeUndefined();
    expect(store.state().pending).toEqual([]);
    expect(store.getSnapshot().words).toEqual([]);
    await store.enqueue("open", [whale]);
    expect(store.state().pending).toEqual([]);
    expect(store.getSnapshot().words).toEqual([whale]);
  });
  it.each([408, 503])("keeps the journal after an ambiguous %i connection response", async (status) => {
    browserGlobals();
    store = new LibraryStore(crypto.randomUUID(), [], false, false); await store.ready;
    store.setDictionary({ entries: {}, wordAliases: {} });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Uncertain" }, { status })));
    remote = createRemote(store);
    await expect(remote.connect("join", { label: "Browser" })).rejects.toThrow("Uncertain");
    await store.enqueue("open", [{ headword: "val", word: "18439" }]);
    expect(store.state().connectionSequence).toBe(0);
    expect(store.state().pending).toHaveLength(1);
  });
  it("retains an earlier uncertain journal when a retry receives a definitive rejection", async () => {
    browserGlobals();
    store = new LibraryStore(crypto.randomUUID(), [], false, false); await store.ready;
    store.setDictionary({ entries: {}, wordAliases: {} });
    const whale = { headword: "val", word: "18439" };
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("Lost response"))
      .mockResolvedValueOnce(Response.json({ error: "Expired" }, { status: 410 })));
    remote = createRemote(store);
    await expect(remote.connect("join", { label: "Browser" })).rejects.toThrow("Lost response");
    await store.enqueue("open", [whale]);
    await expect(remote.connect("join", { label: "Browser" })).rejects.toThrow("Expired");
    expect(store.state().connectionSequence).toBe(0);
    expect(store.state().pending).toHaveLength(1);
    expect(store.getSnapshot().words).toEqual([whale]);
  });

  it("disconnects a cached transport after a terminal operation failure and keeps local words", async () => {
    const requestLock = vi.fn(async (name: string, optionsOrAction: LockOptions | LockGrantedCallback<void>, action?: LockGrantedCallback<void>) => {
      const callback = typeof optionsOrAction === "function" ? optionsOrAction : action;
      return callback?.({ name, mode: "exclusive" });
    });
    browserGlobals();
    vi.stubGlobal("navigator", { locks: { request: requestLock } });
    const whale = { headword: "val", word: "18439" };
    const tea = { headword: "te", word: "123" };
    store = new LibraryStore(crypto.randomUUID(), [whale], false, false); await store.ready;
    await store.accept({ ...store.state().snapshot, libraryId: "shared" });
    const snapshot = store.state().snapshot;
    await store.enqueue("open", [tea]);
    const fetch = vi.fn(async (path: string, options: RequestInit) => {
      if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return path.endsWith("operations")
        ? Response.json({ error: "The shared library is full." }, { status: 422 })
        : Response.json(path.endsWith("disconnect") ? {} : snapshot);
    });
    vi.stubGlobal("fetch", fetch);
    remote = await store.startRemote();
    await remote.flush();
    expect(store.getSnapshot()).toMatchObject({ connected: true, status: "error", pending: 1 });
    expect(fetch.mock.calls.find(([path]) => path.endsWith("operations"))?.[1].signal?.aborted).toBe(true);
    expect(await store.startRemote()).toBe(remote);
    await remote.disconnect();
    expect(fetch.mock.calls.filter(([path]) => path.endsWith("disconnect"))).toHaveLength(1);
    expect(store.getSnapshot()).toMatchObject({ connected: false, status: "local", words: [tea, whale], pending: 0 });
    expect(store.state().snapshot.deviceId).not.toBe(snapshot.deviceId);
    expect(requestLock.mock.calls.filter(([, action]) => typeof action === "function")).toHaveLength(1);
  });
  it("does not disconnect a newer identity when an old transport is used", async () => {
    browserGlobals();
    const name = crypto.randomUUID();
    store = new LibraryStore(name, [], false, false); await store.ready;
    await store.accept({ ...store.state().snapshot, libraryId: "shared" });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(store.state().snapshot)));
    remote = createRemote(store);
    await remote.flush();
    remote.dispose();
    const other = new LibraryStore(name, [], false, false);
    try {
      await other.ready;
      await other.detach();
      await other.accept({ ...other.state().snapshot, libraryId: "new-library" });
      const identity = other.state().snapshot;
      vi.mocked(fetch).mockClear();
      await expect(remote.disconnect()).rejects.toThrow("connection was cancelled");
      expect(fetch).not.toHaveBeenCalled();
      expect(store.state().snapshot).toEqual(identity);
      expect(store.getSnapshot().connected).toBe(true);
    } finally { await other.close(); }
  });
  it("does not detach a newer identity after a delayed disconnect response", async () => {
    browserGlobals();
    const name = crypto.randomUUID();
    store = new LibraryStore(name, [], false, false); await store.ready;
    await store.accept({ ...store.state().snapshot, libraryId: "shared" });
    const response = Promise.withResolvers<Response>();
    const fetch = vi.fn(async (path: string) => path.endsWith("disconnect") ? response.promise : Response.json(store.state().snapshot));
    vi.stubGlobal("fetch", fetch);
    remote = createRemote(store);
    await remote.flush();
    const disconnecting = remote.disconnect();
    const rejected = expect(disconnecting).rejects.toThrow("connection was cancelled");
    await expect.poll(() => fetch.mock.calls.some(([path]) => path.endsWith("disconnect"))).toBe(true);
    const other = new LibraryStore(name, [], false, false);
    try {
      await other.ready;
      await other.detach();
      await other.accept({ ...other.state().snapshot, libraryId: "new-library" });
      const identity = other.state().snapshot;
      response.resolve(Response.json({}));
      await rejected;
      await store.reload();
      expect(store.state().snapshot).toEqual(identity);
      expect(store.getSnapshot().connected).toBe(true);
    } finally { await other.close(); }
  });
  it("requires Web Locks before pairing while local lookup remains usable", async () => {
    browserGlobals();
    vi.stubGlobal("navigator", {});
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    store = new LibraryStore(crypto.randomUUID(), [], false, false); await store.ready;
    remote = createRemote(store);
    await expect(remote.connect("libraries", { label: "Browser" })).rejects.toThrow("up-to-date browser");
    await store.enqueue("open", [{ headword: "te", word: "123" }]);
    expect(fetch).not.toHaveBeenCalled();
    expect(store.getSnapshot().words).toEqual([{ headword: "te", word: "123" }]);
    expect(store.state().pending).toEqual([]);
  });
  it("aborts in-flight work and removes browser listeners when disposed", async () => {
    browserGlobals();
    store = new LibraryStore(crypto.randomUUID(), [], false, false); await store.ready;
    await store.accept({ ...store.state().snapshot, libraryId: "shared" });
    let signal: AbortSignal | null = null;
    const fetch = vi.fn((_path: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => {
      signal = options.signal ?? null;
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetch);
    remote = createRemote(store);
    const syncing = remote.flush();
    await expect.poll(() => fetch.mock.calls.length).toBe(1);
    remote.dispose();
    await syncing;
    expect(fetch.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(window.removeEventListener).toHaveBeenCalledWith("online", expect.any(Function));
    expect(document.removeEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    await remote.flush();
    expect(fetch).toHaveBeenCalledOnce();
    expect(store.getSnapshot().status).toBe("local");
  });
  it("rejects a delayed network snapshot after a different tab disconnects", async () => {
    browserGlobals();
    const name = crypto.randomUUID();
    store = new LibraryStore(name, [], false, false); await store.ready;
    await store.accept({ ...store.state().snapshot, libraryId: "shared", acknowledged: 10 });
    const snapshot = { ...store.state().snapshot, revision: 10 };
    const response = Promise.withResolvers<Response>();
    const fetch = vi.fn(() => response.promise); vi.stubGlobal("fetch", fetch);
    remote = createRemote(store);
    const syncing = remote.flush();
    await expect.poll(() => fetch.mock.calls.length).toBe(1);
    const other = new LibraryStore(name, [], false, false);
    try {
      await other.ready;
      await other.detach();
      await other.enqueue("open", [{ headword: "te", word: "123" }]);
      response.resolve(Response.json(snapshot));
      await syncing;
      expect(store.getSnapshot().connected).toBe(false);
      expect(store.getSnapshot().words).toEqual([{ headword: "te", word: "123" }]);
      expect(store.state().sequence).toBe(1);
      expect(window.removeEventListener).toHaveBeenCalledWith("online", expect.any(Function));
      expect(document.removeEventListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
      await remote.flush();
      expect(fetch).toHaveBeenCalledOnce();
    } finally { await other.close(); }
  });
  it("replays edits after a committed pairing response is lost, including edits during replacement", async () => {
    browserGlobals();
    const name = crypto.randomUUID();
    const whale = { headword: "val", word: "18439" };
    const election = { headword: "val", word: "18440" };
    const tea = { headword: "te", word: "123" };
    const coffee = { headword: "kaffe", word: "124" };
    store = new LibraryStore(name, [whale, election], false, false); await store.ready;
    store.setDictionary({ entries: {}, wordAliases: {} });
    const lost = Promise.withResolvers<Response>();
    const replacement = Promise.withResolvers<Response>();
    let snapshot: LibrarySnapshot = { ...store.state().snapshot, libraryId: "shared" };
    let joins = 0;
    const sequences: number[] = [];
    const fetch = vi.fn(async (path: string, options: RequestInit) => {
      if (path.endsWith("join")) {
        const body = JSON.parse(String(options.body));
        expect(body.deviceId).toBe(snapshot.deviceId);
        snapshot = { ...snapshot, revision: snapshot.revision + 1 };
        snapshot.records = applyOperation(snapshot.records, {
          sequence: body.sequence, baseRevision: snapshot.revision, kind: "import", words: readWords(body.words),
        }, snapshot.deviceId, snapshot.revision);
        joins++;
        return joins === 1 ? lost.promise : replacement.promise;
      }
      if (path.endsWith("operations")) {
        const operations = readOperations(JSON.parse(String(options.body)).operations);
        for (const operation of operations) {
          expect(operation.sequence).toBe(snapshot.acknowledged + 1);
          sequences.push(operation.sequence);
          snapshot = {
            ...snapshot, revision: snapshot.revision + 1, acknowledged: operation.sequence,
            records: applyOperation(snapshot.records, operation, snapshot.deviceId, snapshot.revision + 1),
          };
        }
      }
      return Response.json(snapshot);
    });
    vi.stubGlobal("fetch", fetch);
    remote = createRemote(store);
    const connecting = remote.connect("join", { libraryId: "shared", token: "first", label: "Browser" });
    const failed = expect(connecting).rejects.toThrow("Response lost");
    await expect.poll(() => joins).toBe(1);
    lost.reject(new Error("Response lost"));
    await failed;
    await store.remove("val#18439");
    await store.enqueue("open", [tea]);
    remote.dispose();
    await store.close();
    store = new LibraryStore(name, [], false, false); await store.ready;
    store.setDictionary({ entries: {}, wordAliases: {} });
    expect(store.state().pending.map((operation) => operation.sequence)).toEqual([1, 2]);
    expect(store.getSnapshot().words).toEqual([tea, election]);
    remote = createRemote(store);
    const retry = remote.connect("join", { libraryId: "shared", token: "replacement", label: "Browser" });
    await expect.poll(() => joins).toBe(2);
    expect(snapshot.acknowledged).toBe(0);
    expect(store.state().sequence).toBe(2);
    await store.remove("val#18440");
    await store.enqueue("open", [coffee]);
    replacement.resolve(Response.json({ snapshot }));
    await retry;
    expect(sequences).toEqual([1, 2, 3, 4]);
    expect(store.getSnapshot().words).toEqual([coffee, tea]);
    expect(store.state().pending).toEqual([]);
    await store.enqueue("open", [whale]);
    await remote.flush();
    expect(sequences).toEqual([1, 2, 3, 4, 5]);
    expect(store.getSnapshot().words).toEqual([whale, coffee, tea]);
    expect(store.state().pending).toEqual([]);
  });
  it("replays edits made after a pairing attempt that never reached the server", async () => {
    browserGlobals();
    const whale = { headword: "val", word: "18439" };
    const tea = { headword: "te", word: "123" };
    const coffee = { headword: "kaffe", word: "124" };
    store = new LibraryStore(crypto.randomUUID(), [whale, coffee], false, false); await store.ready;
    store.setDictionary({ entries: {}, wordAliases: {} });
    let snapshot: LibrarySnapshot | null = null;
    let joins = 0;
    vi.stubGlobal("fetch", vi.fn(async (path: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body ?? "{}"));
      if (path.endsWith("join")) {
        if (++joins === 1) throw new TypeError("Network error");
        snapshot = {
          protocol: 2, libraryId: "shared", deviceId: body.deviceId, revision: 2, acknowledged: body.sequence,
          records: applyOperation(recordsOf([whale]), { sequence: body.sequence, baseRevision: 2, kind: "import", words: readWords(body.words) }, body.deviceId, 2),
        };
        return Response.json({ snapshot });
      }
      if (path.endsWith("operations")) {
        for (const operation of readOperations(body.operations)) {
          if (operation.sequence <= snapshot!.acknowledged) continue;
          snapshot = {
            ...snapshot!, revision: snapshot!.revision + 1, acknowledged: operation.sequence,
            records: applyOperation(snapshot!.records, operation, snapshot!.deviceId, snapshot!.revision + 1),
          };
        }
      }
      return Response.json(snapshot);
    }));
    remote = createRemote(store);
    await expect(remote.connect("join", { libraryId: "shared", token: "first", label: "Browser" })).rejects.toThrow("Network error");
    await store.remove("val#18439");
    await store.enqueue("open", [tea]);
    await remote.connect("join", { libraryId: "shared", token: "second", label: "Browser" });
    expect(store.getSnapshot().words).toEqual([tea, coffee]);
    expect(store.state().pending).toEqual([]);
  });
  it("imports current words and sends edits made during the pairing request afterward", async () => {
    browserGlobals();
    const name = crypto.randomUUID();
    store = new LibraryStore(name, [], false, false); await store.ready;
    const whale = { headword: "val", word: "18439" };
    const tea = { headword: "te", word: "123" };
    store.setDictionary({ entries: {}, wordAliases: {} });
    await store.enqueue("open", [whale]);
    const pairingResponse = Promise.withResolvers<Response>();
    let snapshot: LibrarySnapshot = { ...store.state().snapshot, libraryId: "shared", revision: 1, records: recordsOf([whale]) };
    const fetch = vi.fn(async (path: string, options: RequestInit) => {
      if (path.endsWith("libraries")) return pairingResponse.promise;
      if (path.endsWith("operations")) {
        const { operations } = JSON.parse(String(options.body));
        snapshot = { ...snapshot, revision: 2, acknowledged: operations.at(-1).sequence, records: recordsOf([tea, whale]) };
      }
      return Response.json(snapshot);
    });
    vi.stubGlobal("fetch", fetch);
    remote = createRemote(store);
    const connecting = remote.connect("libraries", { label: "Browser" });
    await expect.poll(() => fetch.mock.calls.length).toBe(1);
    expect(JSON.parse(String(fetch.mock.calls[0][1].body))).toMatchObject({ sequence: 1, words: [whale] });
    const other = new LibraryStore(name, [], false, false);
    try {
      await other.ready;
      await other.enqueue("open", [tea]);
      pairingResponse.resolve(Response.json({ snapshot }));
      await connecting;
      expect(store.getSnapshot().words).toEqual([tea, whale]);
      expect(store.state().pending).toEqual([]);
      const operationRequest = fetch.mock.calls.find(([path]) => path.endsWith("operations"));
      expect(JSON.parse(String(operationRequest?.[1].body))).toMatchObject({ operations: [{ sequence: 2, words: [tea] }] });
    } finally { await other.close(); }
  });
});
