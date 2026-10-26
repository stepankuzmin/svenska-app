import { describe, expect, it } from "vitest";
import { applyOperation, maximumWords, readOperations, readWords, receiveSnapshot, recordsOf, visibleWords, type LibrarySnapshot, type SyncOperation } from "../src/sync/model";
const whale = { headword: "val", word: "18439" };
const election = { headword: "val", word: "18440" };
const tea = { headword: "te", word: "123" };
const snapshot: LibrarySnapshot = { protocol: 2, libraryId: "library", deviceId: "phone", revision: 0, acknowledged: 0, records: [] };
function op(kind: SyncOperation["kind"], sequence: number, baseRevision = 0, words = [whale]): SyncOperation {
  return { kind, sequence, baseRevision, words };
}
function words(records: ReturnType<typeof recordsOf>) {
  return visibleWords({ snapshot: { ...snapshot, records }, pending: [], sequence: 0 });
}
describe("sync semantics", () => {
  it("rejects a legacy protocol response before consuming any queued edits", () => {
    const pending = [op("open", 1)];
    const state = { snapshot, sequence: 1, pending };
    expect(() => receiveSnapshot(state, { ...snapshot, protocol: 1, acknowledged: 1 } as unknown as LibrarySnapshot)).toThrow("Update the app");
    expect(state.pending).toEqual(pending);
    expect(state.snapshot.acknowledged).toBe(0);
  });

  it("keeps an acknowledged rejection when an older read has the same record revision", () => {
    const rejected = { ...snapshot, revision: 2, acknowledged: 1, rejectedOperation: { sequence: 1, message: "Full" } };
    const state = { snapshot: rejected, sequence: 2, pending: [op("remove", 2, 2)] };
    expect(receiveSnapshot(state, { ...snapshot, revision: 2 })).toBe(state);
    const next = receiveSnapshot(state, { ...snapshot, revision: 3, acknowledged: 2 });
    expect(next.pending).toEqual([]);
    expect(next.snapshot.rejectedOperation).toBeUndefined();
    expect(next.snapshot.acknowledged).toBe(2);
  });

  it("preserves distinct words and a lookup group's order", () => {
    const records = applyOperation(recordsOf([tea, whale]), op("open", 1, 0, [whale, election]), "phone", 1);
    expect(words(records)).toEqual([whale, election, tea]);
    expect(recordsOf([whale, whale])).toHaveLength(1);
  });
  it("merges unrelated changes and keeps a deletion record", () => {
    const removed = applyOperation(recordsOf([whale, tea]), op("remove", 1), "phone", 1);
    const opened = applyOperation(removed, op("open", 1, 0, [election]), "computer", 2);
    expect(words(opened)).toEqual([election, tea]);
    expect(opened.find((record) => record.word === whale.word)?.present).toBe(false);
  });
  it("removal wins a concurrent opening in either arrival order", () => {
    const seed = recordsOf([whale]);
    const firstRemove = applyOperation(seed, op("remove", 1), "phone", 1);
    expect(words(applyOperation(firstRemove, op("open", 1), "computer", 2))).toEqual([]);
    const firstOpen = applyOperation(seed, op("open", 1), "computer", 1);
    expect(words(applyOperation(firstOpen, op("remove", 1), "phone", 2))).toEqual([]);
  });
  it("reopens after observing removal or after an earlier removal on this device", () => {
    const removed = applyOperation(recordsOf([whale]), op("remove", 1), "phone", 3);
    expect(words(applyOperation(removed, op("open", 1, 3), "computer", 4))).toEqual([whale]);
    expect(words(applyOperation(removed, op("open", 2), "phone", 4))).toEqual([whale]);
  });
  it("imports only new words at the bottom without reviving or reordering known ones", () => {
    const removed = applyOperation(recordsOf([whale, tea]), op("remove", 1), "phone", 1);
    const imported = applyOperation(removed, op("import", 1, 1, [whale, election, tea]), "computer", 2);
    expect(words(imported)).toEqual([tea, election]);
  });
  it("replays pending work over confirmed data and discards only acknowledged changes", () => {
    const state = { snapshot, sequence: 3, pending: [op("open", 1), op("open", 2, 0, [tea]), op("remove", 3)] };
    const confirmed = { ...snapshot, revision: 1, acknowledged: 1, records: recordsOf([whale, election]) };
    const next = receiveSnapshot(state, confirmed);
    expect(next.pending).toHaveLength(2);
    expect(next.sequence).toBe(3);
    expect(visibleWords(next)).toEqual([tea, election]);
    expect(receiveSnapshot(next, { ...confirmed, revision: 0 })).toBe(next);
    expect(() => receiveSnapshot(next, { ...confirmed, libraryId: "other" })).toThrow("Disconnect");
    expect(() => receiveSnapshot(next, { ...confirmed, protocol: 3 } as unknown as LibrarySnapshot)).toThrow("Update");
  });
  it("retains legacy siblings atomically without reviving earlier removals", () => {
    const legacy = { headword: "val", word: "" };
    const removal = { ...op("remove", 1, 0, [legacy, whale]), retained: [{ source: legacy, word: election }] };
    expect(readOperations([removal])).toEqual([removal]);
    expect(words(applyOperation(recordsOf([tea, legacy]), removal, "phone", 1))).toEqual([tea, election]);
    const oldRemoval = applyOperation(recordsOf([tea, legacy, election]), op("remove", 1, 0, [election]), "computer", 1);
    expect(words(applyOperation(oldRemoval, removal, "phone", 2))).toEqual([tea]);
    for (const retained of [null, [{ source: tea, word: election }], [{ source: legacy, word: null }]]) {
      expect(() => readOperations([{ ...removal, retained }])).toThrow("Invalid retained");
    }
    expect(() => readOperations([{ ...removal, kind: "open" }])).toThrow("Only removal");
  });
  it("validates bounded words and operations before accepting network input", () => {
    expect(readWords([whale, whale])).toEqual([whale]);
    expect(readWords([{ headword: "val", word: "" }])).toHaveLength(1);
    for (const value of [null, {}, [{ headword: "", word: "1" }], [{ headword: "val", word: "wrong" }], [whale, tea]]) {
      expect(() => readWords(value, 1)).toThrow("Invalid words");
    }
    expect(readOperations([op("open", 1)])).toEqual([op("open", 1)]);
    const many = Array.from({ length: maximumWords + 1 }, (_, index) => ({ headword: `w${index}`, word: "1" }));
    expect(readOperations([op("open", 1, 0, many.slice(1))])[0].words).toHaveLength(maximumWords);
    expect(() => readOperations([op("open", 1, 0, many)])).toThrow("Invalid words");
    for (const value of [null, [], [null], [op("open", 0)], [op("open", 1, -1)], [{ ...op("open", 1), kind: "unknown" }], [op("open", 1, 0, [])]]) {
      expect(() => readOperations(value)).toThrow();
    }
  });
});
