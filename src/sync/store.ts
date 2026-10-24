import { openDB, type IDBPDatabase } from "idb";
import { loadTransport } from "./load-transport";
import { wordsOpenedBy, type LookupSessionEvent } from "../lookup-session";
import { readLookupLibrary, writeLookupLibrary } from "../lookup-library";
import { resolveLibraryWords, sameWords, wordKey, type LibraryWord } from "../words";
import type { DictionaryAsset } from "../dictionary-contract";
import {
  compactLocal, maximumWords, protocolVersion, receiveSnapshot, recordsOf, visibleWords,
  type LibrarySnapshot, type LibraryState, type SyncOperation,
} from "./model";

export type SyncStatus = "local" | "connecting" | "synced" | "offline" | "saving" | "error" | "revoked";
export type StoreView = { words: readonly LibraryWord[]; connected: boolean; pending: number; durable: boolean; readyForSync: boolean; status: SyncStatus; error: string };
export type Remote = {
  flush: () => Promise<void>;
  connect: (kind: "libraries" | "join" | "recover", details: { libraryId?: string; token?: string; label: string; challenge?: string }) => Promise<{ recoveryCode?: string }>;
  disconnect: () => Promise<void>;
  dispose: () => void;
};

function initialState(words: readonly LibraryWord[]): LibraryState {
  return {
    snapshot: { protocol: protocolVersion, libraryId: "", deviceId: crypto.randomUUID(), revision: 0, acknowledged: 0, records: recordsOf(words) },
    sequence: 0, pending: [],
  };
}

export class LibraryStore {
  private database: Promise<IDBPDatabase>;
  private actions = Promise.resolve();
  private listeners = new Set<() => void>();
  private channel: BroadcastChannel | null;
  private current: LibraryState;
  private view: StoreView;
  private remote: Promise<Remote> | null = null;
  private currentRemote: Remote | null = null;
  private importRetry: ReturnType<typeof setTimeout> | null = null;
  private importDelay = 1000;
  private durable = false;
  private status: SyncStatus = "local";
  private error = "";
  private dictionary: Pick<DictionaryAsset, "entries" | "wordAliases"> | null = null;
  readonly ready: Promise<void>;

  constructor(name = "svenska-library", seed = readLookupLibrary(), broadcast = true, private automatic = true) {
    this.current = initialState(seed);
    this.view = this.makeView();
    this.channel = broadcast && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`${name}-changes`) : null;
    this.database = Promise.resolve().then(() => openDB(name, 1, {
      upgrade(database) { database.createObjectStore("library"); },
      blocked: () => this.setStatus("error", "Close other app tabs to finish upgrading local storage."),
      blocking: () => { void this.database.then((database) => database.close()); },
      terminated: () => this.storageFailed(),
    }));
    this.ready = this.update((state) => compactLocal(state)).then(() => {
      if (this.current.snapshot.libraryId && this.automatic) void this.startRemote().catch(() => this.setStatus("offline"));
    }).catch(() => this.setStatus("error", "Changes cannot be saved on this device. Check browser storage and reload."));
    if (this.channel) this.channel.onmessage = () => { void this.reload().catch(() => this.storageFailed()); };
  }
  private makeView(): StoreView {
    const words = this.dictionary ? resolveLibraryWords({ libraryWords: visibleWords(this.current), dictionary: this.dictionary }) : visibleWords(this.current);
    const previous = this.view?.words;
    return {
      words: previous && sameWords(previous, words) ? previous : words,
      connected: this.current.snapshot.libraryId.length > 0,
      pending: this.current.pending.length, durable: this.durable, readyForSync: this.dictionary !== null && this.durable, status: this.status, error: this.error,
    };
  }
  private publish(): void {
    this.view = this.makeView();
    for (const listener of this.listeners) listener();
  }
  getSnapshot = (): StoreView => this.view;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  setStatus(status: SyncStatus, error = ""): void { this.status = status; this.error = error; this.publish(); }
  private storageFailed(): void {
    this.durable = false;
    this.setStatus("error", "Changes cannot be saved on this device. Check browser storage and reload.");
    writeLookupLibrary(this.view.words);
  }

  private async update(change: (state: LibraryState) => LibraryState): Promise<LibraryState> {
    const transaction = await this.database.then((database) => database.transaction("library", "readwrite"))
      .catch((error) => { this.storageFailed(); throw error; });
    const state = (await transaction.store.get("current").catch((error) => { this.storageFailed(); throw error; }) as LibraryState | undefined) ?? this.current;
    const next = change(state);
    try { await transaction.store.put(next, "current"); await transaction.done; }
    catch (error) { this.storageFailed(); throw error; }
    this.durable = true;
    this.current = next;
    this.publish();
    writeLookupLibrary(this.view.words);
    this.channel?.postMessage("changed");
    return next;
  }
  setDictionary(dictionary: Pick<DictionaryAsset, "entries" | "wordAliases">): void {
    this.dictionary = dictionary;
    this.publish();
    writeLookupLibrary(this.view.words);
  }
  connectionWords(state = this.current): readonly LibraryWord[] {
    if (!this.dictionary) throw new Error("Wait for the dictionary to load before connecting devices.");
    return resolveLibraryWords({ libraryWords: visibleWords(state), dictionary: this.dictionary });
  }
  async reload(): Promise<LibraryState> {
    if (!this.durable) return this.current;
    const previous = this.current.snapshot;
    const wasConnected = Boolean(previous.libraryId);
    let state: LibraryState | undefined;
    try { state = await (await this.database).get("library", "current") as LibraryState | undefined; }
    catch (error) { this.storageFailed(); throw error; }
    if (state) {
      if (state.snapshot.deviceId !== previous.deviceId || state.snapshot.libraryId !== previous.libraryId && wasConnected) this.disposeRemote();
      this.current = state; this.publish();
      if (!state.snapshot.libraryId && wasConnected) this.setStatus("local");
      if (state.snapshot.libraryId && this.automatic && (!this.remote || !wasConnected)) {
        void this.startRemote().then((remote) => remote.flush()).catch(() => this.setStatus("offline"));
      }
    }
    return this.current;
  }
  dispatch(event: LookupSessionEvent): Promise<void> {
    this.actions = this.actions.then(async () => {
      if (event.kind === "word-removed") await this.remove(event.card);
      else {
        const words = wordsOpenedBy(event);
        if (words.length > 0) await this.enqueue("open", words);
      }
    }).catch(() => this.storageFailed());
    return this.actions;
  }
  async enqueue(kind: SyncOperation["kind"], words: LibraryWord[], retained?: SyncOperation["retained"]): Promise<void> {
    await this.ready;
    const queue = (state: LibraryState): LibraryState => compactLocal({
      ...state, sequence: state.sequence + 1,
      pending: [...state.pending, { sequence: state.sequence + 1, baseRevision: state.snapshot.revision, kind, words, ...(retained?.length ? { retained } : {}) }],
    });
    if (!this.durable) { this.current = queue(this.current); this.storageFailed(); return; }
    let attempted: LibraryState | undefined;
    let full = false;
    try {
      await this.update((state) => {
        const next = queue(state);
        full = kind === "open" && !!state.snapshot.libraryId && visibleWords(next).length > maximumWords;
        return full ? state : attempted = next;
      });
      if (full) {
        this.setStatus("error", "This library is full. Remove a word before opening another.");
        return;
      }
      if (this.current.snapshot.libraryId && this.automatic) {
        if (this.status !== "error" && this.status !== "revoked") this.setStatus("saving");
        void this.startRemote().then((remote) => remote.flush()).catch(() => this.setStatus("offline"));
      }
    } catch { this.current = attempted ?? queue(this.current); this.storageFailed(); }
  }
  async remove(card: string): Promise<void> {
    await this.ready;
    await this.reload().catch(() => undefined);
    const words: LibraryWord[] = [];
    const retained: NonNullable<SyncOperation["retained"]> = [];
    for (const source of visibleWords(this.current)) {
      const resolved = this.dictionary ? resolveLibraryWords({ libraryWords: [source], dictionary: this.dictionary }) : [source];
      const target = resolved.find((word) => wordKey(word) === card);
      if (!target) continue;
      words.push(source, target);
      for (const word of resolved) {
        if (wordKey(word) !== card) retained.push({ source, word });
      }
    }
    if (words.length > 0) await this.enqueue("remove", [...new Map(words.map((word) => [wordKey(word), word])).values()], retained);
  }

  async beginConnection(): Promise<LibraryState> {
    await this.ready;
    return this.update((state) => {
      if (state.snapshot.libraryId) throw new Error("Disconnect this device before joining another library.");
      const local = compactLocal(state);
      return { ...local, connectionSequence: local.connectionSequence ?? local.sequence };
    });
  }
  async rejectConnection(expected: LibraryState): Promise<void> {
    await this.update((state) => {
      if (state.snapshot.libraryId || state.snapshot.deviceId !== expected.snapshot.deviceId ||
        state.connectionSequence !== expected.connectionSequence) return state;
      const { connectionSequence: _connectionSequence, ...local } = state;
      return compactLocal(local);
    });
  }
  async accept(snapshot: LibrarySnapshot, expected = this.current): Promise<boolean> {
    if (!this.durable) throw new Error(this.error);
    let accepted = false;
    await this.update((state) => {
      if (state.snapshot.deviceId !== expected.snapshot.deviceId || state.snapshot.libraryId !== expected.snapshot.libraryId) return state;
      if (!expected.snapshot.libraryId && state.connectionSequence !== expected.connectionSequence) return state;
      if (snapshot.deviceId !== expected.snapshot.deviceId) return state;
      accepted = true;
      return receiveSnapshot(state, snapshot);
    });
    return accepted;
  }
  async detach(expected?: LibrarySnapshot): Promise<void> {
    await this.update((state) => {
      if (expected && (state.snapshot.deviceId !== expected.deviceId || state.snapshot.libraryId !== expected.libraryId)) {
        throw new Error("This connection was cancelled. Connect again to sync devices.");
      }
      return initialState(visibleWords(state));
    });
    this.disposeRemote();
    this.setStatus("local");
  }
  private disposeRemote(): void {
    const remote = this.remote;
    this.currentRemote?.dispose();
    this.remote = null;
    this.currentRemote = null;
    if (this.importRetry) clearTimeout(this.importRetry);
    if (remote) void remote.catch(() => undefined);
  }
  state(): LibraryState { return this.current; }
  releaseRemote(remote: Remote): boolean {
    remote.dispose();
    if (this.currentRemote !== remote) return false;
    this.disposeRemote();
    return true;
  }
  async startRemote(): Promise<Remote> {
    if (!this.remote) {
      const loading = loadTransport().then(({ createRemote }) => {
        if (this.remote !== loading) throw new Error("This connection was cancelled.");
        const remote = createRemote(this);
        this.currentRemote = remote;
        this.importDelay = 1000;
        if (this.importRetry) clearTimeout(this.importRetry);
        return remote;
      }).catch((error) => {
        if (this.remote !== loading) throw error;
        this.remote = null;
        if (this.automatic && this.durable && this.current.snapshot.libraryId) {
          if (this.importRetry) clearTimeout(this.importRetry);
          this.importRetry = setTimeout(() => {
            if (this.durable && this.current.snapshot.libraryId) {
              void this.startRemote().catch(() => this.setStatus("offline"));
            }
          }, this.importDelay);
          this.importDelay = Math.min(this.importDelay * 2, 60_000);
        }
        throw error;
      });
      this.remote = loading;
    }
    return this.remote;
  }
  async close(): Promise<void> {
    this.disposeRemote();
    this.channel?.close();
    (await this.database).close();
  }
}

let store: LibraryStore | undefined;
export function libraryStore(): LibraryStore { return store ??= new LibraryStore(); }
