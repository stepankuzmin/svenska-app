import { describe, expect, it } from "vitest";
import { wordForms } from "../src/word-forms.ts";

describe("Swedish word forms", () => {
  it("opens a verb with its infinitive and marks the supine with har", () => {
    expect(wordForms({
      headword: "framgår",
      partOfSpeech: "verb",
      inflections: ["framgick", "framgått", "framgå"],
    })).toEqual(["att framgå", "framgår", "framgick", "har framgått"]);
  });

  it("leaves the imperative out of a verb with four forms", () => {
    expect(wordForms({
      headword: "angriper",
      partOfSpeech: "verb",
      inflections: ["angrep", "angripit", "angrip", "angripa"],
    })).toEqual(["att angripa", "angriper", "angrep", "har angripit"]);
  });

  it("keeps the source order for other word types", () => {
    expect(wordForms({
      headword: "städning",
      partOfSpeech: "subst.",
      inflections: ["städningen"],
    })).toEqual(["städning", "städningen"]);
  });

  it("keeps the source order for a verb Lexin lists without a full paradigm", () => {
    expect(wordForms({
      headword: "må",
      partOfSpeech: "verb",
      inflections: ["måtte"],
    })).toEqual(["må", "måtte"]);
  });
});
