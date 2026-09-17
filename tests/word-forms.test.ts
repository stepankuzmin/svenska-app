import { describe, expect, it } from "vitest";
import { wordFormLines } from "../src/word-forms.ts";

function formsFor(headword: string, sense: { partOfSpeech: string; article?: string; inflections: string[] }) {
  return wordFormLines({ headword, senses: [{ article: "", ...sense }] });
}

describe("Swedish word forms", () => {
  it("opens a verb with its infinitive and marks the supine with har", () => {
    expect(formsFor("framgår", {
      partOfSpeech: "verb",
      inflections: ["framgick", "framgått", "framgå"],
    })).toEqual([["att framgå", "framgår", "framgick", "har framgått"]]);
  });

  it("leaves the imperative out of a verb with four forms", () => {
    expect(formsFor("angriper", {
      partOfSpeech: "verb",
      inflections: ["angrep", "angripit", "angrip", "angripa"],
    })).toEqual([["att angripa", "angriper", "angrep", "har angripit"]]);
  });

  it("opens a noun with its article", () => {
    expect(formsFor("intryck", {
      partOfSpeech: "subst.",
      article: "ett",
      inflections: ["intrycket", "intryck", "intrycken"],
    })).toEqual([["ett intryck", "intrycket", "intryck", "intrycken"]]);
  });

  it("drops a definite singular Lexin writes as the bare article", () => {
    expect(formsFor("action", {
      partOfSpeech: "subst.",
      article: "en",
      inflections: ["en", "action"],
    })).toEqual([["en action", "action"]]);
  });

  it("keeps the source order for other word types", () => {
    expect(formsFor("städning", {
      partOfSpeech: "subst.",
      article: "en",
      inflections: ["städningen"],
    })).toEqual([["en städning", "städningen"]]);
  });

  it("leaves a noun without an article when Lexin spells out no definite singular", () => {
    expect(formsFor("jeans", {
      partOfSpeech: "subst.",
      inflections: ["jeansen"],
    })).toEqual([["jeans", "jeansen"]]);
  });

  it("keeps the source order for a verb Lexin lists without a full paradigm", () => {
    expect(formsFor("må", { partOfSpeech: "verb", inflections: ["måtte"] })).toEqual([["må", "måtte"]]);
  });

  it("reads an en-word and an ett-word of the same spelling on their own lines", () => {
    expect(wordFormLines({
      headword: "val",
      senses: [
        { partOfSpeech: "subst.", article: "en", inflections: ["valen", "valar", "valarna"] },
        { partOfSpeech: "subst.", article: "ett", inflections: ["valet", "val", "valen"] },
      ],
    })).toEqual([
      ["en val", "valen", "valar", "valarna"],
      ["ett val", "valet", "val", "valen"],
    ]);
  });

  it("leaves out a paradigm another line already spells out", () => {
    expect(wordFormLines({
      headword: "bok",
      senses: [
        { partOfSpeech: "subst.", article: "en", inflections: ["boken", "böcker"] },
        { partOfSpeech: "verb", article: "", inflections: [] },
        { partOfSpeech: "subst.", article: "en", inflections: ["boken", "böcker"] },
      ],
    })).toEqual([["en bok", "boken", "böcker"]]);
  });
});
