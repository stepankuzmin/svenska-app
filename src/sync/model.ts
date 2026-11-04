import { uniqueWords, wordKey, type LibraryWord } from "../words";

const wordNumberPattern = /^\d{0,12}$/;

export const protocolVersion = 2;
export const maximumWords = 20_000;
export const maximumRequestBytes = 2 * 1024 * 1024;
const maximumBatch = 100;
export class SnapshotValidationError extends Error { name = "SnapshotValidationError"; }

export type WordRecord = LibraryWord & {
  present: boolean;
  order: number;
  index: number;
  removedRevision: number;
  removedBy: string;
  removedSequence: number;
};
export type SyncOperation = {
  sequence: number;
  baseRevision: number;
  kind: "open" | "remove" | "import";
  words: LibraryWord[];
  retained?: { source: LibraryWord; word: LibraryWord }[];
};
export type LibrarySnapshot = {
  protocol: typeof protocolVersion;
  libraryId: string;
  deviceId: string;
  revision: number;
  acknowledged: number;
  records: WordRecord[];
  rejectedOperation?: { sequence: number; message: string };
};
export type LibraryState = {
  snapshot: LibrarySnapshot;
  pending: SyncOperation[];
  sequence: number;
  connectionSequence?: number;
};

export function recordsOf(words: readonly LibraryWord[]): WordRecord[] {
  return [...new Map(words.map((word, index) => [wordKey(word), {
    ...word, present: true, order: 0, index,
    removedRevision: 0, removedBy: "", removedSequence: 0,
  }])).values()];
}

export function applyOperation(
  records: readonly WordRecord[], operation: SyncOperation, deviceId: string, revision: number,
): WordRecord[] {
  const next = new Map(records.map((record) => [wordKey(record), record]));
  applyTo(next, operation, deviceId, revision);
  return [...next.values()];
}

function applyTo(next: Map<string, WordRecord>, operation: SyncOperation, deviceId: string, revision: number): void {
  operation.retained?.forEach(({ source, word }, index) => {
    const previous = next.get(wordKey(source));
    const existing = next.get(wordKey(word));
    if (previous?.present && existing === undefined) {
      next.set(wordKey(word), { ...previous, ...word, index: previous.index + index / 1000 });
    } else if (previous?.present && existing?.present && (previous.addedAt ?? 0) < (existing.addedAt ?? 0)) {
      next.set(wordKey(word), { ...existing, addedAt: previous.addedAt });
    }
  });
  operation.words.forEach((word, index) => {
    const key = wordKey(word);
    const previous = next.get(key);
    if (operation.kind === "import" && previous !== undefined) {
      if (previous.present && previous.removedRevision === 0 && (word.addedAt ?? 0) < (previous.addedAt ?? 0)) {
        next.set(key, { ...previous, addedAt: word.addedAt });
      }
      return;
    }
    const record = previous ?? recordsOf([word])[0];
    if (operation.kind === "remove") {
      next.set(key, {
        ...record, present: false, removedRevision: revision,
        removedBy: deviceId, removedSequence: operation.sequence,
      });
      return;
    }
    const ownRemoval = record.removedBy === deviceId && record.removedSequence < operation.sequence;
    if (record.removedRevision > operation.baseRevision && !ownRemoval) return;
    const order = operation.kind === "import" ? -revision : revision;
    let addedAt = previous?.present ? previous.addedAt : word.addedAt;
    if (previous?.present && addedAt !== undefined && word.addedAt !== undefined) {
      addedAt = Math.min(addedAt, word.addedAt);
    }
    next.set(key, { ...record, addedAt, present: true, order, index });
  });
}

export function visibleWords(state: LibraryState): LibraryWord[] {
  const records = new Map(state.snapshot.records.map((record) => [wordKey(record), record]));
  state.pending.forEach((operation, index) => applyTo(records, operation, state.snapshot.deviceId, state.snapshot.revision + index + 1));
  return [...records.values()].filter((record) => record.present)
    .toSorted((left, right) => right.order - left.order || left.index - right.index || wordKey(left).localeCompare(wordKey(right)))
    .map(({ headword, word, addedAt }) => ({ headword, word, ...(addedAt === undefined ? {} : { addedAt }) }));
}

export function compactLocal(state: LibraryState): LibraryState {
  if (state.snapshot.libraryId || state.connectionSequence !== undefined) return state;
  return {
    snapshot: { ...state.snapshot, revision: 0, acknowledged: state.sequence, records: recordsOf(visibleWords(state)) },
    sequence: state.sequence, pending: [],
  };
}

export function receiveSnapshot(state: LibraryState, snapshot: LibrarySnapshot): LibraryState {
  if (snapshot.protocol !== protocolVersion) throw new SnapshotValidationError("Update the app to continue syncing.");
  if (state.snapshot.libraryId && state.snapshot.libraryId !== snapshot.libraryId) {
    throw new SnapshotValidationError("Disconnect this device before joining another library.");
  }
  if (state.snapshot.libraryId && (snapshot.revision < state.snapshot.revision || snapshot.acknowledged < state.snapshot.acknowledged)) return state;
  return {
    snapshot,
    sequence: Math.max(state.sequence, snapshot.acknowledged),
    pending: state.pending.filter((operation) => operation.sequence > snapshot.acknowledged),
  };
}

export function isLibraryWord(value: unknown): value is LibraryWord {
  if (!value || typeof value !== "object") return false;
  return "headword" in value && typeof value.headword === "string" && value.headword.length > 0 && value.headword.length <= 250 &&
    "word" in value && typeof value.word === "string" && wordNumberPattern.test(value.word) &&
    (!("addedAt" in value) || typeof value.addedAt === "number" && Number.isSafeInteger(value.addedAt) && value.addedAt > 0);
}
export function readWords(value: unknown, limit = maximumWords): LibraryWord[] {
  if (!Array.isArray(value) || value.length > limit || !value.every(isLibraryWord)) {
    throw new Error("400:Invalid words.");
  }
  return uniqueWords(value.map(({ headword, word, addedAt }) => ({ headword, word, ...(addedAt === undefined ? {} : { addedAt }) })));
}
function readRetained(value: unknown, sources: LibraryWord[]) {
  if (!Array.isArray(value) || value.length > 1000) throw new Error("400:Invalid retained words.");
  const keys = new Set(sources.map(wordKey));
  return value.map((item: { source?: unknown; word?: unknown }) => {
    if (!item || !isLibraryWord(item.source) || !isLibraryWord(item.word) || !keys.has(wordKey(item.source))) {
      throw new Error("400:Invalid retained words.");
    }
    return { source: item.source, word: item.word };
  });
}
export function batchOf(pending: readonly SyncOperation[]): SyncOperation[] {
  const batch: SyncOperation[] = [];
  let bytes = '{"operations":[]}'.length;
  for (const operation of pending.slice(0, maximumBatch)) {
    bytes += new TextEncoder().encode(JSON.stringify(operation)).length + 1;
    if (batch.length > 0 && bytes > maximumRequestBytes) break;
    batch.push(operation);
  }
  return batch;
}

export function readOperations(value: unknown): SyncOperation[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maximumBatch) throw new Error("400:Invalid operations.");
  return value.map((item: Partial<SyncOperation>) => {
    if (!item || !Number.isSafeInteger(item.sequence) || (item.sequence ?? 0) < 1 ||
      !Number.isSafeInteger(item.baseRevision) || (item.baseRevision ?? -1) < 0 ||
      !["open", "remove", "import"].includes(item.kind ?? "")) throw new Error("400:Invalid operation.");
    const words = readWords(item.words);
    if (words.length === 0) throw new Error("400:An operation must name a word.");
    const retained = item.retained === undefined ? undefined : readRetained(item.retained, words);
    if (retained && item.kind !== "remove") throw new Error("400:Only removal can retain sibling words.");
    return { sequence: item.sequence!, baseRevision: item.baseRevision!, kind: item.kind!, words, ...(retained ? { retained } : {}) };
  });
}
