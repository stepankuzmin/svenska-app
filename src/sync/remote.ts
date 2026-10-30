import { QueryClient } from "@tanstack/query-core";
import { batchOf, type LibrarySnapshot } from "./model";
import type { LibraryStore, Remote } from "./store";

export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, networkMode: "always", staleTime: 0 } } });
export class SyncError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export async function syncRequest<T>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST", signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/sync/${path}`, {
    method, credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([AbortSignal.timeout(15_000), ...(signal ? [signal] : [])]),
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new SyncError(response.status, result.error ?? "Sync is temporarily unavailable.");
  return result;
}

export function createRemote(store: LibraryStore): Remote {
  const deviceId = store.state().snapshot.deviceId;
  let stopped = false;
  const requests = new AbortController();
  const request = <T>(path: string, body?: unknown) => syncRequest<T>(path, body, body === undefined ? "GET" : "POST", requests.signal);
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  let retryDelay = 1000;
  let socketDelay = 1000;
  let rerun = false;
  let refreshed = false;

  function schedule(delay: number): void {
    if (timer) clearTimeout(timer);
    if (!stopped) timer = setTimeout(() => { void flush(); }, delay);
  }
  function report(error: unknown): void {
    if (stopped) return;
    if (!store.getSnapshot().durable) {
      remote.dispose();
      store.setStatus("error", store.getSnapshot().error);
      return;
    }
    if (error instanceof SyncError && error.status === 401) {
      if (store.releaseRemote(remote)) store.setStatus("revoked", "This device is disconnected. Your local words are kept.");
      return;
    }
    if (error instanceof Error && error.name === "SnapshotValidationError") {
      remote.dispose(); store.setStatus("error", error.message); return;
    }
    if (error instanceof SyncError && [400, 403, 409, 410, 415, 422].includes(error.status)) {
      remote.dispose();
      store.setStatus("error", error.message);
      return;
    }
    store.setStatus("offline", "Changes are saved on this device and will sync when a connection is available.");
    schedule(retryDelay);
    retryDelay = Math.min(retryDelay * 2, 60_000);
  }
  function listen(): void {
    if (socket || stopped) return;
    const url = new URL("/api/sync/events", location.href);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(url);
    socket.onmessage = () => { socketDelay = 1000; void flush(); };
    socket.onerror = () => socket?.close();
    socket.onclose = (event) => {
      socket = null;
      if (event.code === 4001) { report(new SyncError(401, "Device disconnected.")); }
      else { schedule(socketDelay); socketDelay = Math.min(socketDelay * 2, 60_000); }
    };
  }
  function settled(): void {
    if (stopped) return;
    retryDelay = 1000;
    const rejected = store.state().snapshot.rejectedOperation;
    store.setStatus(rejected ? "error" : "synced", rejected?.message);
    listen();
    if (document.visibilityState === "visible") schedule(30_000);
  }
  async function reconcile(): Promise<void> {
    if (!store.getSnapshot().durable) return;
    await store.reload();
    if (!store.state().snapshot.libraryId || stopped) return;
    const expected = store.state();
    const libraryId = expected.snapshot.libraryId;
    if (refreshed && store.state().pending.length === 0) {
      const revision = await request<Pick<LibrarySnapshot, "protocol" | "revision" | "acknowledged">>("revision");
      await store.reload();
      if (stopped) return;
      const current = store.state().snapshot;
      if (current.deviceId !== expected.snapshot.deviceId || current.libraryId !== libraryId) { store.releaseRemote(remote); return; }
      if (revision.protocol === current.protocol && revision.revision === current.revision && revision.acknowledged === current.acknowledged) {
        settled(); return;
      }
    }
    if (!refreshed || expected.pending.length === 0) {
      const snapshot = await request<LibrarySnapshot>("library");
      if (stopped) return;
      if (!await store.accept(snapshot, expected)) { store.releaseRemote(remote); return; }
      refreshed = true;
    }
    while (true) {
      if (stopped) return;
      const state = await store.reload();
      if (stopped) return;
      if (state.snapshot.deviceId !== expected.snapshot.deviceId || state.snapshot.libraryId !== libraryId) { store.releaseRemote(remote); return; }
      const operations = batchOf(state.pending);
      if (operations.length === 0) break;
      store.setStatus("saving");
      const confirmed = await request<LibrarySnapshot>("operations", { operations });
      if (stopped) return;
      if (!await store.accept(confirmed, expected)) { store.releaseRemote(remote); return; }
    }
    settled();
  }
  async function flush(): Promise<void> {
    if (stopped) return;
    if (running) { rerun = true; return running; }
    const perform = async () => {
      try {
        if (navigator.locks) {
          await navigator.locks.request("svenska-library-sync", { ifAvailable: true }, async (lock) => { if (lock) await reconcile(); else schedule(250); });
        } else await reconcile();
      } catch (error) { report(error); }
    };
    running = perform().finally(() => {
      running = null;
      if (rerun) { rerun = false; schedule(0); }
    });
    return running;
  }
  const wake = () => { if (!stopped && document.visibilityState === "visible") void flush(); };
  window.addEventListener("online", wake);
  document.addEventListener("visibilitychange", wake);

  const remote: Remote = {
    flush,
    async connect(kind, details) {
      const establish = async () => {
        if (stopped) throw new Error("This connection was cancelled. Connect again to sync devices.");
        await store.ready;
        if (!store.getSnapshot().durable) throw new Error("Enable browser storage before connecting devices.");
        const before = await store.reload();
        if (before.snapshot.libraryId) throw new Error("Disconnect this device before joining another library.");
        const state = await store.beginConnection();
        store.setStatus("connecting");
        try {
          const result = await request<{ snapshot: LibrarySnapshot; recoveryCode?: string }>(kind, {
            ...details, deviceId: state.snapshot.deviceId, sequence: state.connectionSequence, words: store.connectionWords({ ...state, pending: [] }),
          });
          if (stopped || !await store.accept(result.snapshot, state)) throw new Error("This connection was cancelled. Connect again to sync devices.");
          return result;
        } catch (error) {
          if (before.connectionSequence === undefined && error instanceof SyncError &&
            error.status >= 400 && error.status < 500 && error.status !== 408) {
            await store.rejectConnection(state);
          }
          if (!stopped) store.setStatus("error", error instanceof Error ? error.message : "Could not connect this device.");
          throw error;
        }
      };
      if (!navigator.locks) throw new Error("Use an up-to-date browser to connect devices.");
      const result = await navigator.locks.request("svenska-library-sync", establish);
      await flush();
      return result;
    },
    dispose() {
      stopped = true;
      requests.abort();
      if (timer) clearTimeout(timer);
      socket?.close();
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    },
    async disconnect() {
      const expected = store.state().snapshot;
      const detach = async () => {
        const current = (await store.reload()).snapshot;
        if (current.deviceId !== deviceId || current.deviceId !== expected.deviceId || current.libraryId !== expected.libraryId) {
          throw new Error("This connection was cancelled. Connect again to sync devices.");
        }
        await syncRequest("disconnect", {});
        await store.detach(expected);
        remote.dispose();
        queryClient.clear();
      };
      if (navigator.locks) await navigator.locks.request("svenska-library-sync", detach);
      else await detach();
    },
  };
  if (store.state().snapshot.libraryId) void flush();
  return remote;
}
