import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibraryStore } from "../src/sync/store";
import { recordsOf, visibleWords, type LibrarySnapshot } from "../src/sync/model";
import { createRemote, queryClient } from "../src/sync/remote";

let store: LibraryStore;
let remote: ReturnType<typeof createRemote>;
afterEach(async () => {
  vi.useRealTimers();
  if (remote) await remote.disconnect();
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
    await vi.advanceTimersByTimeAsync(150_000);
    expect(requested.filter((path) => path.endsWith("library"))).toHaveLength(1);
    expect(requested.filter((path) => path.endsWith("revision"))).toHaveLength(previousChecks + 5);
    snapshot = { ...snapshot, revision: 2, records: recordsOf([{ headword: "fika", word: "4106" }]) };
    await vi.advanceTimersByTimeAsync(30_000);
    await remote.flush();
    expect(requested.filter((path) => path.endsWith("library"))).toHaveLength(2);
    expect(store.state().snapshot.revision).toBe(2);
    expect(visibleWords(store.state())).toEqual([{ headword: "fika", word: "4106" }]);
  });
});
