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
      "совместимый": ["förenlig"],
      "сообщать": ["anger"],
      "такси": ["taxi"],
    });
    expect(dictionary.swedishIndex).toMatchObject({
      ange: ["anger"],
      angav: ["anger"],
      anger: ["anger"],
      angett: ["anger"],
      arslena: ["arsle"],
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
    });
    expect(dictionary.swedishIndex).not.toHaveProperty("förenligare");
    expect(dictionary.swedishIndex).not.toHaveProperty("förenligast");
    expect(dictionary.swedishIndex).not.toHaveProperty("taxien");
    expect(createSearch({ dictionary })("книга")).toEqual({
      kind: "result",
      headword: "bok",
      senses: dictionary.entries.bok,
    });
    expect(createSearch({ dictionary })("ange")).toEqual({
      kind: "result",
      headword: "anger",
      senses: dictionary.entries.anger,
    });
    expect(createSearch({ dictionary })("böckerna")).toEqual({
      kind: "result",
      headword: "bok",
      senses: dictionary.entries.bok,
    });
    expect(createSearch({ dictionary })("arslena")).toEqual({
      kind: "result",
      headword: "arsle",
      senses: dictionary.entries.arsle,
    });
    expect(createSearch({ dictionary })("sannare")).toEqual({
      kind: "result",
      headword: "sann",
      senses: dictionary.entries.sann,
    });
  });

  it("rejects a dictionary asset with malformed senses", () => {
    expect(isDictionaryAsset({ metadata: {}, entries: { bok: [{}] } })).toBe(false);
  });
});
