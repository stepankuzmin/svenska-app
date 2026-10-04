import { describe, expect, it } from "vitest";
import { citationForm, verbInflections, wordForms } from "../src/word-forms.ts";

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

  it("keeps a particle Lexin already inflects with the verb", () => {
    expect(formsFor("laddar ned", {
      partOfSpeech: "verb",
      inflections: ["laddade ned", "laddat ned", "ladda ned", "hämtade", "hämtat", "hämta"],
    })).toEqual(["att ladda ned", "laddar ned", "laddade ned", "har laddat ned"]);
  });

  it.each([
    ["vet", ["visste", "vetat", "veta", "vet"], "att veta"],
    ["sparar", ["sparade", "sparde", "sparat", "spart", "spara", "spar"], "att spara"],
    ["ger", ["gav", "gett", "givit", "ge", "giv", "giva"], "att ge"],
    ["binder", ["band", "bundit", "bind", "binda"], "att binda"],
    ["anför", ["anförde", "anfört", "anför", "anföra"], "att anföra"],
    ["andas", ["andades", "andats", "andas"], "att andas"],
  ])("finds the infinitive of %s wherever Lexin lists it", (headword, inflections, infinitive) => {
    expect(formsFor(headword, { partOfSpeech: "verb", inflections })[0]).toBe(infinitive);
  });

  it.each([
    ["beslutar", ["beslutade", "beslöt", "beslutit", "beslutat", "besluta"], ["beslutade", "beslutit", "beslutat", "besluta"]],
    ["säger", ["sade", "sa", "sagt", "säg", "säga", "säj", "säja"], ["sade", "sagt", "säg", "säga", "säj", "säja"]],
    ["duger", ["dög", "dugde", "dugt", "duga"], ["dög", "dugt", "duga"]],
    ["simmar", ["simmade", "sam", "simmat", "summit", "simma"], ["simmade", "simmat", "summit", "simma"]],
    ["lyder", ["lydde", "löd", "lytt", "lyd", "lyda"], ["lydde", "lytt", "lyd", "lyda"]],
    ["smälter", ["smalt", "smälte", "smält", "smultit", "smält", "smälta"], ["smalt", "smält", "smultit", "smält", "smälta"]],
    ["nyper", ["nöp", "nypt", "nupit", "nyp", "nypa"], ["nöp", "nypt", "nupit", "nyp", "nypa"]],
    ["omsätter", ["omsätter", "omsatte", "omsatt", "omsätt", "omsätta"], ["omsatte", "omsatt", "omsätt", "omsätta"]],
    ["måste", ["måste", "måst"], ["måste", "måst"]],
    ["andas", ["andades", "andats", "andas"], ["andades", "andats", "andas"]],
  ])("puts the supine of %s beside its first preterite", (present, inflections, ordered) => {
    expect(verbInflections({ present, inflections })).toEqual(ordered);
  });

  it("reads a verb with two preterites by the first preterite and supine", () => {
    expect(formsFor("smälter", {
      partOfSpeech: "verb",
      inflections: verbInflections({ present: "smälter", inflections: ["smalt", "smälte", "smält", "smultit", "smält", "smälta"] }),
    })).toEqual(["att smälta", "smälter", "smalt", "har smält"]);
  });

  it("opens a verb with its infinitive when a bare noun sense joins it", () => {
    expect(wordForms({
      headword: "går",
      senses: [
        { partOfSpeech: "subst.", article: "", inflections: [] },
        { partOfSpeech: "verb", article: "", inflections: ["gick", "gått", "gå"] },
      ],
    })).toEqual(["att gå", "går", "gick", "har gått"]);
  });

  it("lets a noun's article spell the headword of a sense without one", () => {
    expect(wordForms({
      headword: "stup",
      senses: [
        { partOfSpeech: "adv.", article: "", inflections: [] },
        { partOfSpeech: "subst.", article: "ett", inflections: ["stupet", "stup", "stupen"] },
      ],
    })).toEqual(["ett stup", "stupet", "stup", "stupen"]);
    expect(wordForms({
      headword: "synd",
      senses: [
        { partOfSpeech: "subst.", article: "en", inflections: ["synden", "synder"] },
        { partOfSpeech: "subst.", article: "", inflections: [] },
      ],
    })).toEqual(["en synd", "synden", "synder"]);
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
    })).toEqual({ form: "att uppskatta", partOfSpeech: "verb" });
    expect(citationForm({
      headword: "sång",
      senses: [{ partOfSpeech: "subst.", article: "en", inflections: ["sången", "sånger", "sångerna"] }],
    })).toEqual({ form: "en sång", partOfSpeech: "subst." });
  });

  it("takes the first sense a prefix can name", () => {
    expect(citationForm({
      headword: "går",
      senses: [
        { partOfSpeech: "subst.", article: "", inflections: [] },
        { partOfSpeech: "verb", article: "", inflections: ["gick", "gått", "gå"] },
      ],
    })).toEqual({ form: "att gå", partOfSpeech: "verb" });
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
