import { describe, expect, it } from "vitest";
import type { DictionaryAsset } from "../src/dictionary-contract.ts";
import { createSearch } from "../src/dictionary.ts";

function sense(partOfSpeech: string, meaning: string, translation: string) {
  return { partOfSpeech, meaning, translation };
}

const dictionary = {
  metadata: {
    sourceEditionDate: "2010-07-07",
    attribution: "Lexin fixture",
    license: "CC BY 4.0",
  },
  entries: {
    bok: [
      sense("subst.", "en samling sidor", "книга"),
      sense("verb", "reservera", "бронировать"),
    ],
    hus: [sense("subst.", "byggnad", "дом")],
    hem: [sense("subst.", "plats där någon bor", "дом")],
    koja: [sense("subst.", "enkel bostad", "дом")],
    torp: [sense("subst.", "litet lantställe", "дом")],
    villa: [sense("subst.", "fristående bostad", "дом")],
    stuga: [sense("subst.", "litet hus", "дом")],
    residens: [sense("subst.", "officiell bostad", "дом")],
    hemvist: [sense("subst.", "stadigvarande plats", "дом")],
    byggnad: [sense("subst.", "uppförd konstruktion", "дом")],
    bostad: [sense("subst.", "plats där någon bor", "жилой дом")],
    dominant: [sense("adj.", "som har störst inflytande", "доминирующий")],
    anger: [
      sense("verb", "meddela", "сообщать"),
      sense("verb", "anmäla", "доносить"),
      sense("verb", "anmäla upprepade gånger", "доносительство"),
      sense("verb", "inte bära fram", "недоносить"),
    ],
    angelägen: [sense("adj.", "viktig", "важный")],
    angett: [sense("adj.", "uppgiven", "указанный")],
    arrangemang: [sense("subst.", "evenemang", "мероприятие")],
    "abort|rådgivning": [sense("subst.", "rådgivning om abort", "консультация по аборту")],
  },
  swedishIndex: {
    ange: ["anger"],
    anger: ["anger"],
    angett: ["anger", "angett"],
    angelägen: ["angelägen"],
    arrangemang: ["arrangemang"],
    bok: ["bok"],
    boken: ["bok"],
    bostad: ["bostad"],
    dominant: ["dominant"],
    byggnad: ["byggnad"],
    hem: ["hem"],
    hemvist: ["hemvist"],
    hus: ["hus"],
    koja: ["koja"],
    residens: ["residens"],
    stuga: ["stuga"],
    torp: ["torp"],
    villa: ["villa"],
    abortrådgivning: ["abort|rådgivning"],
  },
  russianIndex: {
    "бронировать": ["bok"],
    "доносить": ["anger"],
    "доносительство": ["anger"],
    "дом": ["hus", "hem", "koja", "torp", "villa", "stuga", "residens", "hemvist", "byggnad"],
    "книга": ["bok"],
    "недоносить": ["anger"],
  },
} satisfies DictionaryAsset;

describe("dictionary lookup", () => {
  const search = createSearch({ dictionary });

  it("returns every sense for an exact canonical Swedish headword", () => {
    expect(search("bok")).toMatchObject({
      kind: "result",
      headword: "bok",
      senses: dictionary.entries.bok,
    });
  });

  it("returns every indexed Swedish word containing the query in relevance order", () => {
    expect(search("ange")).toEqual({
      kind: "result",
      headword: "anger",
      senses: dictionary.entries.anger,
      suggestions: [
        { displayWord: "ange", headword: "anger", translation: "сообщать" },
        { displayWord: "anger", headword: "anger", translation: "сообщать" },
        { displayWord: "angett", headword: "angett", translation: "указанный" },
        { displayWord: "angelägen", headword: "angelägen", translation: "важный" },
        { displayWord: "arrangemang", headword: "arrangemang", translation: "мероприятие" },
      ],
    });
  });

  it("accepts the displayed form of a canonical Swedish headword containing segment markers", () => {
    expect(search("abortrådgivning")).toMatchObject({
      kind: "result",
      headword: "abort|rådgivning",
      senses: dictionary.entries["abort|rådgivning"],
    });
  });

  it("returns the canonical Swedish result with every sense for an exact Russian translation", () => {
    expect(search(" КНИГА ")).toMatchObject({
      kind: "result",
      headword: "bok",
      senses: dictionary.entries.bok,
    });
  });

  it("returns every indexed Russian phrase containing the query in relevance order", () => {
    expect(search("доноси")).toEqual({
      kind: "choices",
      choices: [
        { displayWord: "доносить", headword: "anger", translation: "доносить" },
        { displayWord: "доносительство", headword: "anger", translation: "доносительство" },
        { displayWord: "недоносить", headword: "anger", translation: "недоносить" },
      ],
    });
  });

  it("matches substrings in both language indexes", () => {
    expect(search("ok")).toEqual({
      kind: "choices",
      choices: [
        { displayWord: "bok", headword: "bok", translation: "книга" },
        { displayWord: "boken", headword: "bok", translation: "книга" },
      ],
    });
    expect(search("ниров")).toMatchObject({
      kind: "choices",
      choices: [{ headword: "bok", translation: "бронировать" }],
    });
  });

  it("returns no match in either lookup direction", () => {
    expect(search("|")).toEqual({ kind: "no-match" });
    expect(search("constructor")).toEqual({ kind: "no-match" });
    expect(search("xyz")).toEqual({ kind: "no-match" });
    expect(search("жюри")).toEqual({ kind: "no-match" });
  });
});
