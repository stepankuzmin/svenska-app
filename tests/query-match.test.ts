import { describe, expect, it } from "vitest";
import { queryMatch, spellsForm } from "../src/query-match.ts";

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

describe("whether a row spells an indexed form", () => {
  it("finds a form in full or behind the prefix its citation adds", () => {
    expect(spellsForm({ forms: minskar, form: "minskade" })).toBe(true);
    expect(spellsForm({ forms: minskar, form: "minska" })).toBe(true);
    expect(spellsForm({ forms: minskar, form: "minskat" })).toBe(true);
    expect(spellsForm({ forms: "en val, valen, valar, valarna", form: "val" })).toBe(true);
  });

  it("does not take a form the row only spells part of", () => {
    expect(spellsForm({ forms: "att anbefalla, anbefaller, anbefallde, har anbefallt", form: "anbefall" })).toBe(false);
    expect(spellsForm({ forms: "abnorm, abnormt, abnorma", form: "abnormare" })).toBe(false);
  });
});
