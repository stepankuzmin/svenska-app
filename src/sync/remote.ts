import { QueryClient } from "@tanstack/react-query";
import type { LibrarySnapshot } from "./model";
import type { LibraryStore, Remote } from "./store";

export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, networkMode: "always", staleTime: 0 } } });
export class SyncError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export async function syncRequest<T>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  const response = await fetch(`/api/sync/${path}`, {
    method, credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15_000),
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new SyncError(response.status, result.error ?? "Sync is temporarily unavailable.");
  return result;
}

export function createRemote(store: LibraryStore): Remote {
  let stopped = false;
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  let retryDelay = 1000;
  let rerun = false;

  function schedule(delay: number): void {
    if (timer) clearTimeout(timer);
    if (!stopped) timer = setTimeout(() => { void flush(); }, delay);
  }
  function report(error: unknown): void {
    if (!store.getSnapshot().durable) {
      stopped = true; socket?.close();
      store.setStatus("error", store.getSnapshot().error);
      return;
    }
    if (error instanceof SyncError && error.status === 401) {
      stopped = true;
      socket?.close();
      store.setStatus("revoked", "This device is disconnected. Your local words are kept.");
      return;
    }
    if (error instanceof SyncError && [400, 403, 409, 410, 415, 422].includes(error.status)) {
      stopped = true;
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
    socket.onmessage = () => { void flush(); };
    socket.onerror = () => socket?.close();
    socket.onclose = (event) => {
      socket = null;
      if (event.code === 4001) { report(new SyncError(401, "Device disconnected.")); }
      else schedule(1000);
    };
  }
  async function reconcile(): Promise<void> {
    if (!store.getSnapshot().durable) return;
    await store.reload();
    if (!store.state().snapshot.libraryId || stopped) return;
    const libraryId = store.state().snapshot.libraryId;
    const snapshot = await queryClient.fetchQuery({
      queryKey: ["library", libraryId], queryFn: () => syncRequest<LibrarySnapshot>("library"),
    });
    await store.accept(snapshot);
    while (true) {
      const state = await store.reload();
      const operations = state.pending.slice(0, 100);
      if (operations.length === 0) break;
      store.setStatus("saving");
      const confirmed = await syncRequest<LibrarySnapshot>("operations", { operations });
      await store.accept(confirmed);
      queryClient.setQueryData(["library", libraryId], confirmed);
    }
    retryDelay = 1000;
    store.setStatus("synced");
    listen();
    schedule(30_000);
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
      await store.ready;
      if (!store.getSnapshot().durable) throw new Error("Enable browser storage before connecting devices.");
      await store.reload();
      if (store.state().snapshot.libraryId) throw new Error("Disconnect this device before joining another library.");
      const state = store.state();
      store.setStatus("connecting");
      try {
        const result = await syncRequest<{ snapshot: LibrarySnapshot; recoveryCode?: string }>(kind, {
          ...details, deviceId: state.snapshot.deviceId, sequence: state.sequence, words: store.connectionWords(),
        });
        await store.accept(result.snapshot);
        stopped = false;
        await flush();
        return result;
      } catch (error) {
        store.setStatus("error", error instanceof Error ? error.message : "Could not connect this device.");
        throw error;
      }
    },
    async disconnect() {
      // A disconnected device keeps its complete local projection, including
      // pending changes, as an independent lookup library.
      await syncRequest("disconnect", {});
      stopped = true;
      if (timer) clearTimeout(timer);
      socket?.close();
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
      queryClient.clear();
      await store.detach();
    },
  };
  if (store.state().snapshot.libraryId) void flush();
  return remote;
}
