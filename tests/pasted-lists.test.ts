import { readdirSync, readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { buildDictionaryAssets } from "../scripts/build-dictionary.ts";
import { createSearch } from "../src/dictionary-search";
import { sortLookupLibrary } from "../src/lookup-library";
import { wordCards } from "../src/word-cards";
import { pastedLinesOf, pastedListText } from "../src/lookup-session";

const listFile = /\.txt$/u;
const directory = new URL("./fixtures/pasted-lists/", import.meta.url);
const lists = readdirSync(directory).filter((file) => file.endsWith(".txt") && !file.endsWith(".copy.txt"));

let dictionary: ReturnType<typeof buildDictionaryAssets>["dictionary"];
let details: ReturnType<typeof buildDictionaryAssets>["details"];
let search: ReturnType<typeof createSearch>;

beforeAll(() => {
  const xml = readFileSync(new URL("../data/lexin/swe_rus-2010-07-07.xml", import.meta.url), "utf8");
  const frequencies = JSON.parse(readFileSync(new URL("../data/kelly/frequencies.json", import.meta.url), "utf8"));
  ({ dictionary, details } = buildDictionaryAssets({ xml, frequencies }));
  search = createSearch({ dictionary });
});

describe("pasted lists", () => {
  it.each(lists)("copies %s with its Russian", (file) => {
    const pasted = readFileSync(new URL(file, directory), "utf8");
    const expected = readFileSync(new URL(file.replace(listFile, ".copy.txt"), directory), "utf8");
    expect(pastedListText({ lines: pastedLinesOf(pasted, search), entries: dictionary.entries })).toBe(expected);
  });
});

describe("Lexin source edition corpus", () => {
  it("joins corpus counts to the words their cards show", () => {
    for (const [headword, expected] of [["de", 381431], ["dem", 152922], ["oss", 106515], ["idag", 98627], ["politik", 41855], ["te", 45826], ["varje", 57195], ["varenda", 33219], ["herr", 11204], ["andning", 2244]] as const) {
      expect(dictionary.entries[headword][0].frequency).toBe(expected);
    }
    for (const headword of ["RÅ", "vård|central", "uppföljning", "uppehålls|tillstånd", "vadå"]) {
      expect(dictionary.entries[headword][0].frequency).toBeUndefined();
    }
    expect(dictionary.entries.ett[0].frequency).toBe(719843);
    expect(dictionary.entries["måste"].map((sense) => sense.frequency)).toEqual([759, 252510, 252510]);
    expect(dictionary.entries.en.find((sense) => sense.partOfSpeech === "obestämd artikel")?.frequency).toBe(1654320);
    expect(dictionary.entries.den.find((sense) => sense.partOfSpeech === "bestämd artikel")?.frequency).toBe(786184);
    expect(dictionary.entries.den.filter((sense) => sense.partOfSpeech === "pron.").map((sense) => sense.frequency))
      .toEqual([225895, 225895]);
    const libraryWords = sortLookupLibrary({
      libraryWords: [{ headword: "vara", word: "18532" }, { headword: "du", word: dictionary.entries.du[0].word }],
      entries: dictionary.entries,
      sort: "frequency",
    });
    expect(wordCards({ libraryWords, entries: dictionary.entries, details: details.entries }).map((card) => card.citation))
      .toEqual(["du", "en vara"]);
    expect(dictionary.entries.blir.find((sense) => sense.partOfSpeech === "verb")?.frequency).toBe(376809);
    expect(dictionary.entries.tar.find((sense) => sense.partOfSpeech === "verb")?.frequency).toBe(279580);
    expect(sortLookupLibrary({
      libraryWords: [{ headword: "du", word: dictionary.entries.du[0].word }, { headword: "blir", word: dictionary.entries.blir[0].word }],
      entries: dictionary.entries,
      sort: "frequency",
    }).map((word) => word.headword)).toEqual(["blir", "du"]);
  });
});
