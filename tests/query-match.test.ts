import { describe, expect, it } from "vitest";
import { formMatch, queryMatch } from "../src/query-match.ts";

function marked({ text, query }: { text: string; query: string }) {
  const match = queryMatch({ text, query });
  return match === null ? null : `${text.slice(0, match.start)}[${text.slice(match.start, match.end)}]${text.slice(match.end)}`;
}

const minskar = "att minska, minskar, minskade, har minskat";

describe("the part of a suggestion a query spells", () => {
  it("marks the form a citation query spells in full", () => {
    expect(marked({ text: minskar, query: "att minska" })).toBe("[att minska], minskar, minskade, har minskat");
    expect(marked({ text: minskar, query: "  Har Minskat " })).toBe("att minska, minskar, minskade, [har minskat]");
    expect(marked({ text: "en val, valen, valar, valarna", query: "en val" })).toBe("[en val], valen, valar, valarna");
  });

  it("prefers a whole word over one the query only opens", () => {
    expect(marked({ text: minskar, query: "minskade" })).toBe("att minska, minskar, [minskade], har minskat");
    expect(marked({ text: minskar, query: "minskar" })).toBe("att minska, [minskar], minskade, har minskat");
  });

  it("marks a whole word, then the start of one, before a match inside one", () => {
    expect(marked({ text: "en val, valen, valar, valarna", query: "val" })).toBe("en [val], valen, valar, valarna");
    expect(marked({ text: minskar, query: "mins" })).toBe("att [mins]ka, minskar, minskade, har minskat");
    expect(marked({ text: "en fika, fikan, fikat", query: "ikat" })).toBe("en fika, fikan, f[ikat]");
  });

  it("falls back to the form a citation opens when the query as typed spells none", () => {
    expect(marked({ text: minskar, query: "att minskade" })).toBe("att minska, minskar, [minskade], har minskat");
  });

  it("drops a Lexin segment marker from the query, as the lookup does", () => {
    expect(marked({ text: "hårdkokt", query: "hård|kokt" })).toBe("[hårdkokt]");
  });

  it("marks a Russian translation by the same rule", () => {
    expect(marked({ text: "доминирующий · жилой дом", query: "дом" }))
      .toBe("доминирующий · жилой [дом]");
    expect(marked({ text: "Дом", query: "дом" })).toBe("[Дом]");
  });

  it("marks nothing the text does not spell", () => {
    expect(marked({ text: minskar, query: "öka" })).toBeNull();
    expect(marked({ text: minskar, query: "   " })).toBeNull();
  });
});

function formMarked({ forms, form, query }: { forms: string; form: string; query: string }) {
  const { text, match } = formMatch({ forms, form, query });
  return match === null ? text : `${text.slice(0, match.start)}[${text.slice(match.start, match.end)}]${text.slice(match.end)}`;
}

describe("the indexed form a Swedish suggestion marks", () => {
  it("marks the query inside the form that offered the word", () => {
    expect(formMarked({ forms: minskar, form: "minskade", query: "minskade" }))
      .toBe("att minska, minskar, [minskade], har minskat");
    expect(formMarked({ forms: minskar, form: "minskat", query: "minskat" }))
      .toBe("att minska, minskar, minskade, har [minskat]");
  });

  it("marks a citation only for a query that opens with one", () => {
    expect(formMarked({ forms: minskar, form: "minska", query: "att minska" }))
      .toBe("[att minska], minskar, minskade, har minskat");
    expect(formMarked({ forms: minskar, form: "minskat", query: "har minskat" }))
      .toBe("att minska, minskar, minskade, [har minskat]");
    expect(formMarked({ forms: "ett bett, bettet, bett, betten", form: "bettet", query: "ett" }))
      .toBe("ett bett, b[ett]et, bett, betten");
    expect(formMarked({ forms: "att attackera, attackerar", form: "attackera", query: "att" }))
      .toBe("att [att]ackera, attackerar");
  });

  it("leads with a form the row leaves out", () => {
    expect(formMarked({ forms: "abnorm, abnormt, abnorma", form: "abnormare", query: "abnormare" }))
      .toBe("[abnormare] · abnorm, abnormt, abnorma");
    expect(formMarked({ forms: "att anbefalla, anbefaller", form: "anbefall", query: "anbefall" }))
      .toBe("[anbefall] · att anbefalla, anbefaller");
  });

  it("keeps a form that holds a comma of its own whole", () => {
    expect(formMarked({ forms: "äldre, äldst", form: "äldre, äldst", query: "äldre" })).toBe("[äldre], äldst");
  });
});
