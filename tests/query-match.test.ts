import { describe, expect, it } from "vitest";
import { queryMatches, withForm } from "../src/query-match.ts";

function marked({ text, query }: { text: string; query: string }) {
  let shown = "";
  let from = 0;
  for (const { start, end } of queryMatches({ text, query })) {
    shown += `${text.slice(from, start)}[${text.slice(start, end)}]`;
    from = end;
  }
  return shown + text.slice(from);
}

const minskar = "att minska, minskar, minskade, har minskat";

describe("the places a suggestion spells the query", () => {
  it("marks every place the row spells the query", () => {
    expect(marked({ text: minskar, query: "minsk" })).toBe("att [minsk]a, [minsk]ar, [minsk]ade, har [minsk]at");
    expect(marked({ text: minskar, query: "minskade" })).toBe("att minska, minskar, [minskade], har minskat");
    expect(marked({ text: "en val, valen, valar, valarna", query: "val" }))
      .toBe("en [val], [val]en, [val]ar, [val]arna");
  });

  it("marks a citation query as typed where the row spells it so", () => {
    expect(marked({ text: minskar, query: "att minska" })).toBe("[att minska], minskar, minskade, har minskat");
    expect(marked({ text: minskar, query: "  Har Minskat " })).toBe("att minska, minskar, minskade, [har minskat]");
  });

  it("marks the form a citation query names where the row does not spell the query", () => {
    expect(marked({ text: minskar, query: "att minskade" })).toBe("att minska, minskar, [minskade], har minskat");
  });

  it("drops a Lexin segment marker from the query, as the lookup does", () => {
    expect(marked({ text: "hårdkokt", query: "hård|kokt" })).toBe("[hårdkokt]");
  });

  it("marks a Russian translation by the same rule", () => {
    expect(marked({ text: "доминирующий · жилой дом", query: "дом" })).toBe("[дом]инирующий · жилой [дом]");
    expect(marked({ text: "Дом", query: "дом" })).toBe("[Дом]");
  });

  it("marks nothing the text does not spell", () => {
    expect(queryMatches({ text: minskar, query: "öka" })).toEqual([]);
    expect(queryMatches({ text: minskar, query: "   " })).toEqual([]);
  });
});

describe("an indexed form the row's forms leave out", () => {
  it("follows the forms when no form the row shows spells the query", () => {
    expect(withForm({ forms: "abnorm, abnormt, abnorma", form: "abnormare", query: "abnormar" }))
      .toBe("abnorm, abnormt, abnorma · abnormare");
    expect(withForm({ forms: "tack", form: "tackare", query: "tackare" })).toBe("tack · tackare");
  });

  it("leaves the forms as they are while a form the row shows spells the query", () => {
    const påminner = "att påminna, påminner, påminde, har påmint";
    expect(withForm({ forms: påminner, form: "påminn", query: "påminn" })).toBe(påminner);
    expect(withForm({ forms: påminner, form: "påminna", query: "påmin" })).toBe(påminner);
    expect(withForm({ forms: "abnorm, abnormt, abnorma", form: "abnormare", query: "abnorm" }))
      .toBe("abnorm, abnormt, abnorma");
    expect(withForm({ forms: "att anbefalla, anbefaller", form: "anbefall", query: "anbefall" }))
      .toBe("att anbefalla, anbefaller");
  });

  it("is not repeated when the row spells it, with or without a citation", () => {
    expect(withForm({ forms: minskar, form: "minskade", query: "att minskade" })).toBe(minskar);
    expect(withForm({ forms: minskar, form: "minska", query: "minska" })).toBe(minskar);
    expect(withForm({ forms: "en val, valen, valar, valarna", form: "val", query: "val" }))
      .toBe("en val, valen, valar, valarna");
    expect(withForm({ forms: "äldre, äldst", form: "äldre, äldst", query: "äldre, äldst" })).toBe("äldre, äldst");
  });
});
