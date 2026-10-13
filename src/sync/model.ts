import { wordKey, type LibraryWord } from "../words";

const wordNumberPattern = /^\d{0,12}$/;

export const protocolVersion = 1;
export const maximumWords = 20_000;
export class SnapshotValidationError extends Error {}

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
  protocol: 1;
  libraryId: string;
  deviceId: string;
  revision: number;
  acknowledged: number;
  records: WordRecord[];
};
export type LibraryState = {
  snapshot: LibrarySnapshot;
  pending: SyncOperation[];
  sequence: number;
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
  operation.retained?.forEach(({ source, word }, index) => {
    const previous = next.get(wordKey(source));
    // Splitting a legacy spelling keeps its remaining words in the same place.
    // Known removal records must never be revived by this implicit migration.
    if (previous?.present && !next.has(wordKey(word))) {
      next.set(wordKey(word), { ...previous, ...word, index: previous.index + index / 1000 });
    }
  });
  operation.words.forEach((word, index) => {
    const key = wordKey(word);
    const previous = next.get(key);
    if (operation.kind === "import" && previous !== undefined) return;
    const record = previous ?? recordsOf([word])[0];
    if (operation.kind === "remove") {
      next.set(key, {
        ...record, present: false, removedRevision: revision,
        removedBy: deviceId, removedSequence: operation.sequence,
      });
      return;
    }
    // Removal wins concurrent openings. A device can also reopen a word
    // after its own queued removal, even before receiving that acknowledgement.
    const ownRemoval = record.removedBy === deviceId && record.removedSequence < operation.sequence;
    if (record.removedRevision > operation.baseRevision && !ownRemoval) return;
    const order = operation.kind === "import" ? -revision : revision;
    next.set(key, { ...record, present: true, order, index });
  });
  return [...next.values()];
}

export function visibleWords(state: LibraryState): LibraryWord[] {
  const records = state.pending.reduce(
    (current, operation, index) => applyOperation(current, operation, state.snapshot.deviceId, state.snapshot.revision + index + 1),
    state.snapshot.records,
  );
  return records.filter((record) => record.present)
    .toSorted((left, right) => right.order - left.order || left.index - right.index || wordKey(left).localeCompare(wordKey(right)))
    .map(({ headword, word }) => ({ headword, word }));
}

export function receiveSnapshot(state: LibraryState, snapshot: LibrarySnapshot): LibraryState {
  if (snapshot.protocol !== protocolVersion) throw new SnapshotValidationError("Update the app to continue syncing.");
  if (state.snapshot.libraryId && state.snapshot.libraryId !== snapshot.libraryId) {
    throw new SnapshotValidationError("Disconnect this device before joining another library.");
  }
  if (state.snapshot.libraryId && snapshot.revision < state.snapshot.revision) return state;
  return {
    snapshot,
    sequence: Math.max(state.sequence, snapshot.acknowledged),
    pending: state.pending.filter((operation) => operation.sequence > snapshot.acknowledged),
  };
}

export function isLibraryWord(value: unknown): value is LibraryWord {
  if (!value || typeof value !== "object") return false;
  const word = value as Partial<LibraryWord>;
  return typeof word.headword === "string" && word.headword.length > 0 && word.headword.length <= 250 &&
    typeof word.word === "string" && wordNumberPattern.test(word.word);
}
export function readWords(value: unknown, limit = maximumWords): LibraryWord[] {
  if (!Array.isArray(value) || value.length > limit || !value.every(isLibraryWord)) {
    throw new Error("400:Invalid words.");
  }
  return [...new Map(value.map((word) => [wordKey(word), { headword: word.headword, word: word.word }])).values()];
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
export function readOperations(value: unknown): SyncOperation[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) throw new Error("400:Invalid operations.");
  return value.map((item: Partial<SyncOperation>) => {
    if (!item || !Number.isSafeInteger(item.sequence) || (item.sequence ?? 0) < 1 ||
      !Number.isSafeInteger(item.baseRevision) || (item.baseRevision ?? -1) < 0 ||
      !["open", "remove", "import"].includes(item.kind ?? "")) throw new Error("400:Invalid operation.");
    const words = readWords(item.words, 1000);
    if (words.length === 0) throw new Error("400:An operation must name a word.");
    const retained = item.retained === undefined ? undefined : readRetained(item.retained, words);
    if (retained && item.kind !== "remove") throw new Error("400:Only removal can retain sibling words.");
    return { sequence: item.sequence!, baseRevision: item.baseRevision!, kind: item.kind!, words, ...(retained ? { retained } : {}) };
  });
}
