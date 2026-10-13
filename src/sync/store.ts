import { openDB, type IDBPDatabase } from "idb";
import { wordsOpenedBy, type LookupSessionEvent } from "../lookup-session";
import { readLookupLibrary, writeLookupLibrary } from "../lookup-library";
import { resolveLibraryWords, wordKey, type LibraryWord } from "../words";
import type { DictionaryAsset } from "../dictionary-contract";
import {
  receiveSnapshot, recordsOf, visibleWords,
  type LibrarySnapshot, type LibraryState, type SyncOperation,
} from "./model";

export type SyncStatus = "local" | "connecting" | "synced" | "offline" | "saving" | "error" | "revoked";
export type StoreView = { words: LibraryWord[]; connected: boolean; pending: number; durable: boolean; readyForSync: boolean; status: SyncStatus; error: string };
export type Remote = {
  flush: () => Promise<void>;
  connect: (kind: "libraries" | "join" | "recover", details: { libraryId?: string; token?: string; label: string }) => Promise<{ recoveryCode?: string }>;
  disconnect: () => Promise<void>;
};

function initialState(words: readonly LibraryWord[]): LibraryState {
  return {
    snapshot: { protocol: 1, libraryId: "", deviceId: crypto.randomUUID(), revision: 0, acknowledged: 0, records: recordsOf(words) },
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
      terminated: () => this.setStatus("error", "Local storage closed unexpectedly. Reload to save your changes."),
    }));
    this.ready = this.update((state) => state).then(() => {
      if (this.current.snapshot.libraryId && this.automatic) void this.startRemote().catch(() => this.setStatus("offline"));
    }).catch(() => this.setStatus("error", "Changes cannot be saved on this device. Check browser storage and reload."));
    if (this.channel) this.channel.onmessage = () => { void this.reload().catch(() => this.storageFailed()); };
  }
  private makeView(): StoreView {
    return {
      words: visibleWords(this.current), connected: this.current.snapshot.libraryId.length > 0,
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
  private storageFailed(): void { this.durable = false; this.setStatus("error", "Changes cannot be saved on this device. Check browser storage and reload."); }

  private async update(change: (state: LibraryState) => LibraryState): Promise<LibraryState> {
    const database = await this.database;
    const transaction = database.transaction("library", "readwrite");
    const state = (await transaction.store.get("current") as LibraryState | undefined) ?? this.current;
    const next = change(state);
    await transaction.store.put(next, "current");
    await transaction.done;
    this.durable = true;
    this.current = next;
    // Retain a rollback-readable snapshot for older cached app shells. IndexedDB
    // alone owns acknowledgement, ordering, and the durable pending queue.
    this.writeBackup();
    this.publish();
    this.channel?.postMessage("changed");
    return next;
  }
  private writeBackup(): void {
    const words = visibleWords(this.current);
    writeLookupLibrary(this.dictionary ? resolveLibraryWords({ libraryWords: words, dictionary: this.dictionary }) : words);
  }
  setDictionary(dictionary: Pick<DictionaryAsset, "entries" | "wordAliases">): void {
    this.dictionary = dictionary;
    this.writeBackup();
    this.publish();
  }
  connectionWords(): readonly LibraryWord[] {
    if (!this.dictionary) throw new Error("Wait for the dictionary to load before connecting devices.");
    return resolveLibraryWords({ libraryWords: visibleWords(this.current), dictionary: this.dictionary });
  }
  async reload(): Promise<LibraryState> {
    if (!this.durable) return this.current;
    const state = await (await this.database).get("library", "current") as LibraryState | undefined;
    if (state) {
      this.current = state; this.publish();
      if (state.snapshot.libraryId && this.automatic && !this.remote) {
        void this.startRemote().catch(() => this.setStatus("offline"));
      }
    }
    return this.current;
  }
  dispatch(event: LookupSessionEvent, dictionary: Pick<DictionaryAsset, "entries" | "wordAliases"> | null): Promise<void> {
    this.actions = this.actions.then(async () => {
      if (event.kind === "word-removed") await this.remove(event.card, dictionary);
      else {
        const words = wordsOpenedBy(event);
        if (words.length > 0) await this.enqueue("open", words);
      }
    }).catch(() => this.storageFailed());
    return this.actions;
  }
  async enqueue(kind: SyncOperation["kind"], words: LibraryWord[], retained?: SyncOperation["retained"]): Promise<void> {
    await this.ready;
    const queue = (state: LibraryState): LibraryState => ({
      ...state, sequence: state.sequence + 1,
      pending: [...state.pending, { sequence: state.sequence + 1, baseRevision: state.snapshot.revision, kind, words, ...(retained?.length ? { retained } : {}) }],
    });
    if (!this.durable) { this.current = queue(this.current); this.storageFailed(); return; }
    let attempted: LibraryState | undefined;
    try {
      await this.update((state) => attempted = queue(state));
      if (this.current.snapshot.libraryId && this.automatic) {
        this.setStatus("saving");
        void this.startRemote().then((remote) => remote.flush()).catch(() => this.setStatus("offline"));
      }
    } catch { this.current = attempted ?? queue(this.current); this.storageFailed(); }
  }
  async remove(card: string, dictionary: Pick<DictionaryAsset, "entries" | "wordAliases"> | null): Promise<void> {
    await this.ready;
    await this.reload();
    const words: LibraryWord[] = [];
    const retained: NonNullable<SyncOperation["retained"]> = [];
    for (const source of visibleWords(this.current)) {
      const resolved = dictionary ? resolveLibraryWords({ libraryWords: [source], dictionary }) : [source];
      const target = resolved.find((word) => wordKey(word) === card);
      if (!target) continue;
      words.push(source, target);
      for (const word of resolved) {
        if (wordKey(word) !== card) retained.push({ source, word });
      }
    }
    if (words.length > 0) await this.enqueue("remove", [...new Map(words.map((word) => [wordKey(word), word])).values()], retained);
  }

  async accept(snapshot: LibrarySnapshot): Promise<void> {
    if (!this.durable) throw new Error(this.error);
    await this.update((state) => receiveSnapshot(state, snapshot));
  }
  async detach(): Promise<void> {
    await this.update((state) => initialState(visibleWords(state)));
    this.remote = null;
    this.setStatus("local");
  }
  state(): LibraryState { return this.current; }
  async startRemote(): Promise<Remote> {
    if (!this.remote) this.remote = import("./remote").then(({ createRemote }) => createRemote(this));
    return this.remote;
  }
  async close(): Promise<void> {
    this.channel?.close();
    (await this.database).close();
  }
}

let store: LibraryStore | undefined;
export function libraryStore(): LibraryStore { return store ??= new LibraryStore(); }
