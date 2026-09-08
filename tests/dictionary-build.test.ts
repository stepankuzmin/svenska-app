import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildDictionary } from "../scripts/build-dictionary.ts";
import { createSearch, isDictionaryAsset } from "../src/dictionary.ts";

describe("Lexin source edition import", () => {
  it("preserves source metadata and groups every exact Swedish headword sense", async () => {
    const xml = await readFile(new URL("./fixtures/lexin-small.xml", import.meta.url), "utf8");

    const dictionary = buildDictionary({ xml });

    expect(dictionary.metadata).toMatchObject({
      sourceEditionDate: "2010-07-07",
      attribution: "Lexin: Svensk-ryskt lexikon — Institutet för språk och folkminnen (Språkrådet)",
      license: "CC BY 4.0",
    });
    expect(dictionary.entries.bok).toEqual([
      { partOfSpeech: "subst.", meaning: "en samling sidor", translation: "книга" },
      { partOfSpeech: "verb", meaning: "reservera", translation: "бронировать" },
    ]);
    expect(dictionary.russianIndex).toEqual({
      "бронировать": ["bok"],
      "дом": ["hus", "hem"],
      "книга": ["bok"],
    });
    expect(createSearch({ dictionary })("книга")).toEqual({
      kind: "result",
      headword: "bok",
      senses: dictionary.entries.bok,
    });
  });

  it("rejects a dictionary asset with malformed senses", () => {
    expect(isDictionaryAsset({ metadata: {}, entries: { bok: [{}] } })).toBe(false);
  });
});
