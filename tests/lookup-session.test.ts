import { describe, expect, it } from "vitest";
import type { LookupChoice, LookupOutcome } from "../src/dictionary";
import { reduceLookupSession, type LookupSession, type LookupSessionEvent } from "../src/lookup-session";

const sense = (word: string) => ({ word, partOfSpeech: "subst.", meaning: "", translation: "" });
const entries = {
  val: [sense("1"), sense("2")],
  fika: [sense("5")],
  katt: [sense("7")],
};
const val1 = { headword: "val", word: "1" };
const val2 = { headword: "val", word: "2" };
const fika = { headword: "fika", word: "5" };
const katt = { headword: "katt", word: "7" };
const choice = (word: typeof val1, exact: boolean): LookupChoice => ({
  displayWord: word.headword,
  word,
  language: "sv",
  exact,
});

function startLookupSession({ query, libraryWords }: Pick<LookupSession, "query" | "libraryWords">): LookupSession {
  return { query, libraryWords, expandedCard: null, opens: 0 };
}

function run(session: LookupSession, event: LookupSessionEvent) {
  return reduceLookupSession({ session, event, entries });
}

const result: LookupOutcome = {
  kind: "result",
  headword: "val",
  senses: entries.val,
  suggestions: [],
};

describe("lookup session", () => {
  it("submits a result by opening its words, extending the first card and emptying the field", () => {
    const session = startLookupSession({ query: "val", libraryWords: [katt] });
    const next = run(session, { kind: "submitted", outcome: result });
    expect(next).toEqual({
      query: "",
      libraryWords: [val1, val2, katt],
      expandedCard: "val#1",
      opens: 1,
    });
  });

  it("leaves the session as it was when the field holds no result", () => {
    const session = startLookupSession({ query: "va", libraryWords: [katt] });
    expect(run(session, { kind: "submitted", outcome: { kind: "choices", choices: [choice(val1, false)] } })).toBe(session);
    expect(run(session, { kind: "submitted", outcome: null })).toBe(session);
  });

  it("picks one word, extends its card and empties the field", () => {
    const session = startLookupSession({ query: "va", libraryWords: [katt] });
    expect(run(session, { kind: "picked", choice: choice(val2, false) })).toEqual({
      query: "",
      libraryWords: [val2, katt],
      expandedCard: "val#2",
      opens: 1,
    });
  });

  it("opens a deep link result without emptying the field", () => {
    const session = startLookupSession({ query: "val", libraryWords: [] });
    const next = run(session, { kind: "deep-linked", outcome: result });
    expect(next.query).toBe("val");
    expect(next.libraryWords).toEqual([val1, val2]);
    expect(next.expandedCard).toBe("val#1");
  });

  it("opens every exact choice of a deep link and extends the first headword", () => {
    const session = startLookupSession({ query: "fika", libraryWords: [] });
    const outcome: LookupOutcome = { kind: "choices", choices: [choice(fika, true), choice(katt, true), choice(val1, false)] };
    const next = run(session, { kind: "deep-linked", outcome });
    expect(next.libraryWords).toEqual([fika, katt]);
    expect(next.expandedCard).toBe("fika#5");
  });

  it("ignores a deep link that names no exact word", () => {
    const session = startLookupSession({ query: "zzz", libraryWords: [] });
    expect(run(session, { kind: "deep-linked", outcome: { kind: "no-match" } })).toBe(session);
    expect(run(session, {
      kind: "deep-linked",
      outcome: { kind: "choices", choices: [choice(val1, false)] },
    })).toBe(session);
  });

  it("extends one card at a time and closes it when toggled again", () => {
    const session = startLookupSession({ query: "", libraryWords: [] });
    const first = run(session, { kind: "card-toggled", card: "val#1" });
    expect(first.expandedCard).toBe("val#1");
    expect(run(first, { kind: "card-toggled", card: "val#2" }).expandedCard).toBe("val#2");
    expect(run(first, { kind: "card-toggled", card: "val#1" }).expandedCard).toBeNull();
  });

  it("follows the query and removes a word", () => {
    const session = { ...startLookupSession({ query: "", libraryWords: [val1, katt] }), expandedCard: "val#1" };
    expect(run(session, { kind: "query-changed", query: "ka" })).toMatchObject({ query: "ka", expandedCard: null });
    expect(run(session, { kind: "word-removed", card: "val#1" }).libraryWords).toEqual([katt]);
  });

  it("resolves the library against a loaded dictionary and keeps it when nothing changes", () => {
    const wordAliases = { "val#9": "1" };
    const stale = startLookupSession({ query: "", libraryWords: [{ headword: "val", word: "9" }] });
    expect(run(stale, { kind: "dictionary-loaded", dictionary: { entries, wordAliases } }).libraryWords).toEqual([val1]);

    const current = startLookupSession({ query: "", libraryWords: [val1] });
    expect(run(current, { kind: "dictionary-loaded", dictionary: { entries, wordAliases } })).toBe(current);
  });

  it("drops a library word the dictionary no longer knows as a word into every word its spelling holds", () => {
    const session = startLookupSession({ query: "", libraryWords: [{ headword: "val", word: "99" }] });
    const next = run(session, { kind: "dictionary-loaded", dictionary: { entries, wordAliases: {} } });
    expect(next.libraryWords).toEqual([val1, val2]);
  });
});
