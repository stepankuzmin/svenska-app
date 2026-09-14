import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildDictionaryAssets } from "../scripts/build-dictionary.ts";
import { createSearch, isDictionaryAsset } from "../src/dictionary.ts";

describe("Lexin source edition import", () => {
  it("preserves source metadata and groups every exact Swedish headword sense", async () => {
    const xml = await readFile(new URL("./fixtures/lexin-small.xml", import.meta.url), "utf8");

    const { dictionary, details } = buildDictionaryAssets({ xml });

    expect(dictionary.metadata).toMatchObject({
      sourceEditionDate: "2010-07-07",
      attribution: "Lexin: Svensk-ryskt lexikon — Institutet för språk och folkminnen (Språkrådet)",
      license: "CC BY 4.0",
    });
    expect(dictionary.entries.bok).toEqual([
      {
        partOfSpeech: "subst.",
        meaning: "en samling sidor",
        translation: "книга",
      },
      {
        partOfSpeech: "verb",
        meaning: "reservera",
        translation: "бронировать",
      },
    ]);
    expect(details.entries.bok).toEqual([
      {
        phonetic: "bu:k",
        inflections: ["boken", "böcker"],
        examples: [{ swedish: "jag läser en bok", russian: "я читаю книгу" }],
        compounds: [{ swedish: "bokhylla", russian: "книжная полка" }],
      },
      { phonetic: "", inflections: [], examples: [], compounds: [] },
    ]);
    expect(dictionary.russianIndex).toEqual({
      "бронировать": ["bok"],
      "дом": ["hus", "hem"],
      "жопа": ["arsle"],
      "книга": ["bok"],
      "младенец": ["baby"],
      "правдивый": ["sann"],
      "сентиментальная ценность": ["affektions|värde"],
      "совместимый": ["förenlig"],
      "сообщать": ["anger"],
      "такси": ["taxi"],
      "хуже": ["värre"],
      "экшн": ["action"],
      "АО": ["AB"],
    });
    expect(dictionary.swedishIndex).toMatchObject({
      AB: ["AB"],
      ange: ["anger"],
      angav: ["anger"],
      anger: ["anger"],
      angett: ["anger"],
      arslena: ["arsle"],
      affektionsvärdena: ["affektions|värde"],
      babyarna: ["baby"],
      babyerna: ["baby"],
      bok: ["bok"],
      boken: ["bok"],
      böcker: ["bok"],
      böckerna: ["bok"],
      förenlig: ["förenlig"],
      förenliga: ["förenlig"],
      förenligt: ["förenlig"],
      sann: ["sann"],
      sanna: ["sann"],
      sannare: ["sann"],
      sannast: ["sann"],
      sant: ["sann"],
      taxi: ["taxi"],
      taxin: ["taxi"],
      taxina: ["taxi"],
      värre: ["värre"],
      värst: ["värre"],
      värsta: ["värre"],
    });
    expect(dictionary.swedishIndex).not.toHaveProperty("actionen");
    expect(dictionary.swedishIndex).not.toHaveProperty("actionna");
    expect(dictionary.swedishIndex).not.toHaveProperty("affektionsvärdenaen");
    expect(dictionary.swedishIndex).not.toHaveProperty("förenligare");
    expect(dictionary.swedishIndex).not.toHaveProperty("förenligast");
    expect(dictionary.swedishIndex).not.toHaveProperty("taxien");
    expect(dictionary.swedishIndex).not.toHaveProperty("värstare");
    expect(dictionary.swedishIndex).not.toHaveProperty("värstast");
    expect(createSearch({ dictionary })("книга")).toMatchObject({
      kind: "result",
      headword: "bok",
      senses: dictionary.entries.bok,
    });
    expect(createSearch({ dictionary })("ange")).toMatchObject({
      kind: "result",
      headword: "anger",
      senses: dictionary.entries.anger,
    });
    expect(createSearch({ dictionary })("böckerna")).toMatchObject({
      kind: "result",
      headword: "bok",
      senses: dictionary.entries.bok,
    });
    expect(createSearch({ dictionary })("arslena")).toMatchObject({
      kind: "result",
      headword: "arsle",
      senses: dictionary.entries.arsle,
    });
    expect(createSearch({ dictionary })("sannare")).toMatchObject({
      kind: "result",
      headword: "sann",
      senses: dictionary.entries.sann,
    });
    const uppercaseResult = createSearch({ dictionary })("ab");
    expect(uppercaseResult).toMatchObject({
      kind: "result",
      headword: "AB",
    });
    expect(uppercaseResult.kind === "result" ? uppercaseResult.suggestions[0] : null).toEqual({
      displayWord: "AB",
      headwords: ["AB"],
      language: "sv",
    });
    const uppercaseRussianResult = createSearch({ dictionary })("ао");
    expect(
      uppercaseRussianResult.kind === "result" ? uppercaseRussianResult.suggestions[0] : null,
    ).toEqual({
      displayWord: "АО",
      headwords: ["AB"],
      language: "ru",
    });
  });

  it("rejects a dictionary asset with malformed senses", () => {
    expect(isDictionaryAsset({ metadata: {}, entries: { bok: [{}] } })).toBe(false);
  });
});
