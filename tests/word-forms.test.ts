import { describe, expect, it } from "vitest";
import { citationForm, wordForms } from "../src/word-forms.ts";

function formsFor(headword: string, sense: { partOfSpeech: string; article?: string; inflections: string[] }) {
  return wordForms({ headword, senses: [{ article: "", ...sense }] });
}

describe("Swedish word forms", () => {
  it("opens a verb with its infinitive and marks the supine with har", () => {
    expect(formsFor("framgår", {
      partOfSpeech: "verb",
      inflections: ["framgick", "framgått", "framgå"],
    })).toEqual(["att framgå", "framgår", "framgick", "har framgått"]);
  });

  it("leaves the imperative out of a verb with four forms", () => {
    expect(formsFor("angriper", {
      partOfSpeech: "verb",
      inflections: ["angrep", "angripit", "angrip", "angripa"],
    })).toEqual(["att angripa", "angriper", "angrep", "har angripit"]);
  });

  it("carries the rest of a verb phrase through every form", () => {
    expect(formsFor("aktar sig", {
      partOfSpeech: "verb",
      inflections: ["aktade", "aktat", "akta"],
    })).toEqual(["att akta sig", "aktar sig", "aktade sig", "har aktat sig"]);
  });

  it("opens a noun with its article", () => {
    expect(formsFor("intryck", {
      partOfSpeech: "subst.",
      article: "ett",
      inflections: ["intrycket", "intryck", "intrycken"],
    })).toEqual(["ett intryck", "intrycket", "intryck", "intrycken"]);
  });

  it("drops a definite singular Lexin writes as the bare article", () => {
    expect(formsFor("action", {
      partOfSpeech: "subst.",
      article: "en",
      inflections: ["en", "action"],
    })).toEqual(["en action", "action"]);
  });

  it("keeps the source order for other word types", () => {
    expect(formsFor("städning", {
      partOfSpeech: "subst.",
      article: "en",
      inflections: ["städningen"],
    })).toEqual(["en städning", "städningen"]);
  });

  it("leaves a noun without an article when Lexin spells out no definite singular", () => {
    expect(formsFor("jeans", {
      partOfSpeech: "subst.",
      inflections: ["jeansen"],
    })).toEqual(["jeans", "jeansen"]);
  });

  it("keeps the source order for a verb Lexin lists without a full paradigm", () => {
    expect(formsFor("må", { partOfSpeech: "verb", inflections: ["måtte"] })).toEqual(["må", "måtte"]);
  });

  it("keeps a form an adjective's paradigm spells twice", () => {
    expect(formsFor("fast", { partOfSpeech: "adj.", inflections: ["fast", "fasta"] }))
      .toEqual(["fast", "fast", "fasta"]);
    expect(wordForms({
      headword: "fast",
      senses: [
        { partOfSpeech: "adj.", article: "", inflections: ["fast", "fasta"] },
        { partOfSpeech: "adj.", article: "", inflections: ["fast", "fasta"] },
      ],
    })).toEqual(["fast", "fast", "fasta"]);
  });

  it("keeps a plural spelled like the headword", () => {
    expect(formsFor("adoptivbarn", {
      partOfSpeech: "se",
      inflections: ["adoptivbarnet", "adoptivbarn", "adoptivbarnen"],
    })).toEqual(["adoptivbarn", "adoptivbarnet", "adoptivbarn", "adoptivbarnen"]);
  });

  it("merges the forms Lexin spells out for one sense and leaves to another", () => {
    expect(wordForms({
      headword: "engelska",
      senses: [
        { partOfSpeech: "subst.", article: "en", inflections: ["engelskan"] },
        { partOfSpeech: "subst.", article: "en", inflections: ["engelskan", "engelskor", "engelskorna"] },
      ],
    })).toEqual(["en engelska", "engelskan", "engelskor", "engelskorna"]);
  });
});

describe("the citation form", () => {
  it("names a verb by its infinitive and a noun by its article", () => {
    expect(citationForm({
      headword: "uppskattar",
      senses: [{ partOfSpeech: "verb", article: "", inflections: ["uppskattade", "uppskattat", "uppskatta"] }],
    })).toBe("att uppskatta");
    expect(citationForm({
      headword: "sång",
      senses: [{ partOfSpeech: "subst.", article: "en", inflections: ["sången", "sånger", "sångerna"] }],
    })).toBe("en sång");
  });

  it("takes the first sense a prefix can name", () => {
    expect(citationForm({
      headword: "går",
      senses: [
        { partOfSpeech: "subst.", article: "", inflections: [] },
        { partOfSpeech: "verb", article: "", inflections: ["gick", "gått", "gå"] },
      ],
    })).toBe("att gå");
  });

  it("has none for a word no prefix names", () => {
    expect(citationForm({ headword: "fast", senses: [{ partOfSpeech: "adj.", article: "", inflections: ["fast", "fasta"] }] }))
      .toBeNull();
    expect(citationForm({ headword: "må", senses: [{ partOfSpeech: "verb", article: "", inflections: ["måtte"] }] }))
      .toBeNull();
    expect(citationForm({ headword: "jeans", senses: [{ partOfSpeech: "subst.", article: "", inflections: ["jeansen"] }] }))
      .toBeNull();
  });
});
