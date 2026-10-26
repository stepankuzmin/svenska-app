import { describe, expect, it } from "vitest";
import type { LookupChoice, LookupOutcome } from "../src/dictionary";
import { pastedLinesOf, pastedListText, reduceLookupSession, termsOf, type LookupSession, type LookupSessionEvent } from "../src/lookup-session";

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
  return { query, libraryWords, expandedCard: null, opens: 0, pastedList: null };
}

function run(session: LookupSession, event: LookupSessionEvent) {
  return reduceLookupSession({ session, event });
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
      pastedList: null,
    });
  });

  it("extends the card of the first word a result opens, not of its headword", () => {
    const session = startLookupSession({ query: "valurna", libraryWords: [katt] });
    const second: LookupOutcome = { ...result, senses: [entries.val[1]] };
    expect(run(session, { kind: "submitted", outcome: second })).toEqual({
      query: "",
      libraryWords: [val2, katt],
      expandedCard: "val#2",
      opens: 1,
      pastedList: null,
    });
  });

  it("submits a Swedish spelling several headwords hold by opening every word it names", () => {
    const session = startLookupSession({ query: "valfika", libraryWords: [katt] });
    const outcome: LookupOutcome = {
      kind: "choices",
      choices: [choice(val2, true), choice(fika, true), { ...choice(katt, true), language: "ru" }, choice(val1, false)],
    };
    expect(run(session, { kind: "submitted", outcome })).toEqual({
      query: "",
      libraryWords: [val2, fika, katt],
      expandedCard: "val#2",
      opens: 1,
      pastedList: null,
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
      pastedList: null,
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

  it("names the Swedish words every pasted line spells", () => {
    const outcomes: Record<string, LookupOutcome> = {
      fika: { kind: "result", headword: "fika", senses: entries.fika, suggestions: [choice(fika, true)] },
      val: { ...result, suggestions: [choice(val1, true), choice(val2, true)] },
      кит: { ...result, suggestions: [{ ...choice(val1, true), language: "ru" }] },
      valfångst: { kind: "choices", choices: [{ ...choice(val1, true), form: "valfångst", related: true }] },
    };
    expect(pastedLinesOf("- fika = val - \nкит\nvalfångst", (term) => outcomes[term] ?? { kind: "no-match" })).toEqual([
      { line: "- fika = val - ", words: [fika, val1, val2] },
      { line: "кит", words: [] },
      { line: "valfångst", words: [] },
    ]);
  });

  it("opens every word of a pasted list as one lookup and keeps the list until the field changes", () => {
    const session = startLookupSession({ query: "fik", libraryWords: [katt] });
    const pastedList = [{ line: "fika", words: [fika] }, { line: "zzz", words: [] }, { line: "val", words: [val1, val2, fika] }];
    const next = run(session, { kind: "pasted", pastedList });
    expect(next).toEqual({ query: "", libraryWords: [fika, val1, val2, katt], expandedCard: "fika#5", opens: 1, pastedList });
    expect(run(next, { kind: "query-changed", query: "k" }).pastedList).toBeNull();
  });

  it("keeps a pasted list that opens no word without opening anything", () => {
    const session = startLookupSession({ query: "", libraryWords: [katt] });
    const pastedList = [{ line: "skjuta ihjäl", words: [] }];
    expect(run(session, { kind: "pasted", pastedList })).toEqual({ ...session, pastedList });
  });

  it("reads the terms of a list line", () => {
    expect(termsOf("- kriminalitet = brottslighet - ")).toEqual(["kriminalitet", "brottslighet"]);
    expect(termsOf("2. skjuta ihjäl")).toEqual(["skjuta ihjäl"]);
    expect(termsOf("brott - перелом")).toEqual([]);
    expect(termsOf("- kriminalitet = brottslighet - преступность")).toEqual([]);
    expect(termsOf("- e-post - ")).toEqual(["e-post"]);
    expect(termsOf("- ")).toEqual([]);
  });

  it("copies each pasted line back with its Russian and every other line as pasted", () => {
    const translated = {
      val: [{ ...sense("1"), translation: "кит" }, { ...sense("2"), translation: "выбор" }],
      fika: [{ ...sense("5"), translation: "перерыв на кофе" }],
      drog: [
        { word: "9", partOfSpeech: "se", meaning: "", translation: "тянуть · тащить" },
        { word: "9", partOfSpeech: "subst.", meaning: "", translation: "наркотик" },
      ],
    };
    expect(pastedListText({
      entries: translated,
      pastedList: [
        { line: "- val - ", words: [val1, val2] },
        { line: "skjuta ihjäl", words: [] },
        { line: "", words: [] },
        { line: "fika  ", words: [fika] },
        { line: "droger", words: [{ headword: "drog", word: "9" }] },
      ],
    })).toBe("- val - кит, выбор\nskjuta ihjäl\n\nfika - перерыв на кофе\ndroger - наркотик");
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
