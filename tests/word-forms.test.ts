import { describe, expect, it } from "vitest";
import { wordForms } from "../src/word-forms.ts";

describe("Swedish word forms", () => {
  it("opens a verb with its infinitive and marks the supine with har", () => {
    expect(wordForms({
      headword: "framgår",
      partOfSpeech: "verb",
      article: "",
      inflections: ["framgick", "framgått", "framgå"],
    })).toEqual(["att framgå", "framgår", "framgick", "har framgått"]);
  });

  it("leaves the imperative out of a verb with four forms", () => {
    expect(wordForms({
      headword: "angriper",
      partOfSpeech: "verb",
      article: "",
      inflections: ["angrep", "angripit", "angrip", "angripa"],
    })).toEqual(["att angripa", "angriper", "angrep", "har angripit"]);
  });

  it("opens a noun with its article", () => {
    expect(wordForms({
      headword: "intryck",
      partOfSpeech: "subst.",
      article: "ett",
      inflections: ["intrycket", "intryck", "intrycken"],
    })).toEqual(["ett intryck", "intrycket", "intryck", "intrycken"]);
  });

  it("keeps the source order for other word types", () => {
    expect(wordForms({
      headword: "städning",
      partOfSpeech: "subst.",
      article: "en",
      inflections: ["städningen"],
    })).toEqual(["en städning", "städningen"]);
  });

  it("leaves a noun without an article when Lexin spells out no definite singular", () => {
    expect(wordForms({
      headword: "jeans",
      partOfSpeech: "subst.",
      article: "",
      inflections: ["jeansen"],
    })).toEqual(["jeans", "jeansen"]);
  });

  it("keeps the source order for a verb Lexin lists without a full paradigm", () => {
    expect(wordForms({
      headword: "må",
      partOfSpeech: "verb",
      article: "",
      inflections: ["måtte"],
    })).toEqual(["må", "måtte"]);
  });
});
