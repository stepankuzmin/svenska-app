import { describe, expect, it } from "vitest";
import type { DictionaryAsset } from "../src/dictionary-contract.ts";
import { createSearch } from "../src/dictionary.ts";

function sense(word: string, partOfSpeech: string, meaning: string, translation: string) {
  return { word, partOfSpeech, meaning, translation };
}

const dictionary = {
  metadata: {
    sourceEditionDate: "2010-07-07",
    attribution: "Lexin fixture",
    license: "CC BY 4.0",
  },
  entries: {
    bok: [
      sense("101", "subst.", "en samling sidor", "книга"),
      sense("101", "verb", "reservera", "бронировать"),
    ],
    hus: [sense("102", "subst.", "byggnad", "дом")],
    hem: [sense("103", "subst.", "plats där någon bor", "дом")],
    koja: [sense("104", "subst.", "enkel bostad", "дом")],
    torp: [sense("105", "subst.", "litet lantställe", "дом")],
    villa: [sense("106", "subst.", "fristående bostad", "дом")],
    stuga: [sense("107", "subst.", "litet hus", "дом")],
    residens: [sense("108", "subst.", "officiell bostad", "дом")],
    hemvist: [sense("109", "subst.", "stadigvarande plats", "дом")],
    byggnad: [sense("110", "subst.", "uppförd konstruktion", "дом")],
    bostad: [sense("111", "subst.", "plats där någon bor", "жилой дом")],
    dominant: [sense("112", "adj.", "som har störst inflytande", "доминирующий")],
    anger: [
      sense("113", "verb", "meddela", "сообщать"),
      sense("113", "verb", "anmäla", "доносить"),
      sense("113", "verb", "anmäla upprepade gånger", "доносительство"),
      sense("113", "verb", "inte bära fram", "недоносить"),
    ],
    angelägen: [sense("114", "adj.", "viktig", "важный")],
    angett: [sense("115", "adj.", "uppgiven", "указанный")],
    arrangemang: [sense("116", "subst.", "evenemang", "мероприятие")],
    "abort|rådgivning": [sense("117", "subst.", "rådgivning om abort", "консультация по аборту")],
    fast: [
      { word: "3917", partOfSpeech: "adj.", meaning: "hård, massiv", translation: "твёрдый" },
      { word: "3917", partOfSpeech: "adj.", meaning: "som har stabilt läge", translation: "крепкий" },
      { word: "3918", partOfSpeech: "konj.", meaning: "trots att, fastän", translation: "хотя" },
    ],
  },
  swedishIndex: {
    ange: ["113"],
    anger: ["113"],
    angett: ["113", "115"],
    angelägen: ["114"],
    arrangemang: ["116"],
    bok: ["101"],
    boken: ["101"],
    bostad: ["111"],
    dominant: ["112"],
    byggnad: ["110"],
    hem: ["103"],
    hemvist: ["109"],
    hus: ["102"],
    koja: ["104"],
    residens: ["108"],
    stuga: ["107"],
    torp: ["105"],
    villa: ["106"],
    abortrådgivning: ["117"],
    fast: ["3917", "3918"],
    fastare: ["3917"],
  },
  russianIndex: {
    "100 граммов": ["102"],
    "бронировать": ["101"],
    "доносить": ["113"],
    "доносительство": ["113"],
    "дом": ["102", "103", "104", "105", "106", "107", "108", "109", "110"],
    "книга": ["101"],
    "недоносить": ["113"],
    "хотя": ["3918"],
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

  it("returns every word with a form containing the query, once, in relevance order", () => {
    // `ange`, `anger` and `angett` all spell forms of one word, which reads as
    // its headword and ranks by its best matching form.
    expect(search("ange")).toEqual({
      kind: "result",
      headword: "anger",
      senses: dictionary.entries.anger,
      suggestions: [
        { displayWord: "anger", word: { headword: "anger", word: "113" }, language: "sv", exact: true },
        { displayWord: "angett", word: { headword: "angett", word: "115" }, language: "sv", exact: false },
        { displayWord: "angelägen", word: { headword: "angelägen", word: "114" }, language: "sv", exact: false },
        {
          displayWord: "arrangemang",
          word: { headword: "arrangemang", word: "116" },
          language: "sv",
          exact: false,
        },
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
        // Three translations of one word offer it once, as the best match.
        { displayWord: "доносить", word: { headword: "anger", word: "113" }, language: "ru", exact: false },
      ],
    });
    // A translation many words share offers each of them on its own.
    expect(search("дом")).toMatchObject({
      kind: "choices",
      choices: ([
        ["hus", "102"], ["hem", "103"], ["koja", "104"], ["torp", "105"], ["villa", "106"],
        ["stuga", "107"], ["residens", "108"], ["hemvist", "109"], ["byggnad", "110"],
      ] as const).map(([headword, word]) => ({
        displayWord: "дом",
        word: { headword, word },
        language: "ru",
        exact: true,
      })),
    });
  });

  it("matches substrings in both language indexes", () => {
    expect(search("ok")).toEqual({
      kind: "choices",
      choices: [
        { displayWord: "bok", word: { headword: "bok", word: "101" }, language: "sv", exact: false },
      ],
    });
    expect(search("ниров")).toMatchObject({
      kind: "choices",
      choices: [{ displayWord: "бронировать", word: { headword: "bok", word: "101" }, language: "ru" }],
    });
    expect(search("100")).toMatchObject({
      kind: "choices",
      choices: [{ displayWord: "100 граммов", word: { headword: "hus", word: "102" }, language: "ru" }],
    });
  });

  it("offers each word a spelling holds as a suggestion of its own, and each word once", () => {
    const adjective = { headword: "fast", word: "3917" };
    const conjunction = { headword: "fast", word: "3918" };
    expect(search("fas")).toEqual({
      kind: "choices",
      choices: [
        { displayWord: "fast", word: adjective, language: "sv", exact: false },
        { displayWord: "fast", word: conjunction, language: "sv", exact: false },
      ],
    });
    // `fastare` is a form of the adjective, which it offers under its headword.
    expect(search("fastare")).toMatchObject({
      kind: "result",
      headword: "fast",
      suggestions: [{ displayWord: "fast", word: adjective, language: "sv", exact: true }],
    });
    expect(search("хот")).toEqual({
      kind: "choices",
      choices: [{ displayWord: "хотя", word: conjunction, language: "ru", exact: false }],
    });
  });

  it("returns no match in either lookup direction", () => {
    expect(search("|")).toEqual({ kind: "no-match" });
    expect(search("constructor")).toEqual({ kind: "no-match" });
    expect(search("xyz")).toEqual({ kind: "no-match" });
    expect(search("жюри")).toEqual({ kind: "no-match" });
  });
});
