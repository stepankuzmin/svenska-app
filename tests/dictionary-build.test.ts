import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { buildDictionaryAssets } from "../scripts/build-dictionary.ts";
import {
  createSearch,
  hasDictionaryAssetShape,
  hasDictionaryDetailsShape,
} from "../src/dictionary.ts";

type Assets = ReturnType<typeof buildDictionaryAssets>;

let assets: Assets;
let search: ReturnType<typeof createSearch>;

beforeAll(async () => {
  const xml = await readFile(new URL("./fixtures/lexin-small.xml", import.meta.url), "utf8");
  assets = buildDictionaryAssets({ xml });
  search = createSearch({ dictionary: assets.dictionary });
});

function closestSuggestion(query: string) {
  const outcome = search(query);
  return outcome.kind === "result" ? outcome.suggestions[0] : null;
}

describe("Lexin source edition import", () => {
  it("groups every sense of a headword and keeps its details alongside", () => {
    expect(assets.dictionary.metadata).toEqual({
      sourceEditionDate: "2010-07-07",
      attribution: "Lexin: Svensk-ryskt lexikon — Institutet för språk och folkminnen (Språkrådet)",
      license: "CC BY 4.0",
    });
    // Lexin numbers the book and the verb apart, so the spelling holds two words.
    expect(assets.dictionary.entries.bok).toEqual([
      { word: "1", partOfSpeech: "subst.", meaning: "en samling sidor", translation: "книга" },
      { word: "14", partOfSpeech: "verb", meaning: "reservera", translation: "бронировать" },
    ]);
    expect(assets.dictionary.entries.hus).toEqual([
      { word: "2", partOfSpeech: "subst.", meaning: "byggnad", translation: "дом" },
    ]);
    expect(assets.details.entries.bok).toEqual([
      {
        phonetic: "bu:k",
        article: "en",
        inflections: ["boken", "böcker", "böckerna"],
        examples: [{ swedish: "jag läser en bok", russian: "я читаю книгу" }],
        compounds: [{ swedish: "bokhylla", russian: "книжная полка" }],
      },
      { phonetic: "", article: "", inflections: [], examples: [], compounds: [] },
    ]);
  });

  it("keeps a verb's first preterite and supine together and indexes every form", () => {
    expect(assets.details.entries.beslutar[0].inflections).toEqual(["beslutade", "beslutit", "beslutat", "besluta"]);
    expect(assets.dictionary.swedishIndex.beslöt).toEqual(["70"]);
    expect(search("har beslutit")).toMatchObject({ kind: "result", headword: "beslutar" });
  });

  it("completes a noun's paradigm with the definite plural Lexin leaves implicit", () => {
    expect(assets.details.entries.bok[0].inflections).toEqual(["boken", "böcker", "böckerna"]);
    expect(assets.details.entries.taxi[0].inflections).toEqual(["taxin", "taxi", "taxina"]);
    // An adjective's comparative and superlative belong to a paradigm the word
    // card does not show, so they stay out of its forms.
    expect(assets.details.entries.sann[0].inflections).toEqual(["sant", "sanna"]);
  });

  it("reads a noun's article from the definite singular Lexin spells out", () => {
    expect(assets.details.entries.bok[0].article).toBe("en");
    expect(assets.details.entries.arsle[0].article).toBe("ett");
    // A word Lexin marks as plural lists a definite plural, not a definite
    // singular, so it carries no article.
    expect(assets.details.entries.jeans[0].article).toBe("");
    expect(assets.details.entries.hus[0].article).toBe("");
  });

  it("indexes every translation against the Lexin number of the word that carries it", () => {
    expect(assets.dictionary.russianIndex).toEqual({
      "АО": ["15"],
      "беречься": ["60"],
      "блюдо": ["48", "50"],
      "бронировать": ["14"],
      "вкрутую": ["hård|kokt#16"],
      "вписывать": ["39", "40"],
      "да": ["36"],
      "джинсы": ["13"],
      "должен": ["17", "21"],
      "долженствовать": ["17", "21"],
      "дом": ["2", "3", "27"],
      "ездить": ["25"],
      "жопа": ["6"],
      "зависимость": ["90"],
      "книга": ["1"],
      "кооператив": ["33", "34"],
      "крутой": ["hårdkokt#16"],
      "культурный центр для иммигрантов": ["43", "44"],
      "куча": ["42"],
      "младенец": ["7"],
      "научная работа (статья)": ["22"],
      "нести": ["29", "30"],
      "овца": ["45"],
      "омбудсмен": ["35", "37"],
      "отец": ["24", "26"],
      "писать": ["38"],
      "получать": ["46", "47"],
      "правдивый": ["5"],
      "прочь": ["20"],
      "решать": ["70"],
      "сентиментальная ценность": ["10"],
      "совместимый": ["9"],
      "суд": ["49"],
      "сообщать": ["4"],
      "такси": ["8", "27"],
      "техосмотр": ["32", "31"],
      "хуже": ["12"],
      "экшн": ["11"],
      "ягода": ["28"],
    });
  });

  it("names the spelling beside a number Lexin gives two spellings", () => {
    expect(assets.dictionary.swedishIndex["hårdkokt"]).toEqual(["hård|kokt#16", "hårdkokt#16"]);
    expect(search("вкрутую")).toMatchObject({ kind: "result", headword: "hård|kokt" });
    expect(closestSuggestion("вкрутую")).toEqual({
      displayWord: "вкрутую",
      word: { headword: "hård|kokt", word: "16" },
      language: "ru",
      exact: true,
    });
  });

  it("indexes a spelling against each word it holds and a form against the word it inflects", () => {
    expect(assets.dictionary.swedishIndex.bok).toEqual(["1", "14"]);
    expect(assets.dictionary.swedishIndex.boken).toEqual(["1"]);
  });

  it("keeps one word for the numbers Lexin gives a spelling it inflects one way", () => {
    expect(assets.dictionary.entries["bör"].map(({ word }) => word)).toEqual(["17", "17"]);
    // A library that kept the joined number finds the word it joined.
    expect(assets.dictionary.wordAliases).toEqual({ "bör#18": "17" });
    // The book and the verb inflect differently, so they stay two words.
    expect(assets.dictionary.entries.bok.map(({ word }) => word)).toEqual(["1", "14"]);
  });

  it("offers the word a query spells as its headword before one it spells as a form", () => {
    const outcome = search("Bort");
    expect(outcome.kind).toBe("choices");
    expect(outcome.kind === "choices" ? outcome.choices : []).toEqual([
      { displayWord: "bort", word: { headword: "bort", word: "20" }, language: "sv", exact: true, form: "bort" },
      { displayWord: "bör", word: { headword: "bör", word: "17" }, language: "sv", exact: true, form: "bort" },
    ]);
  });

  it("offers a word before a spelling Lexin holds only as a cross reference to it", () => {
    const outcome = search("borde");
    expect(outcome.kind === "choices" ? outcome.choices.map(({ word }) => word) : []).toEqual([
      { headword: "bör", word: "17" },
      { headword: "borde", word: "21" },
    ]);
  });

  it("indexes the forms a verb phrase's card spells out with the rest of its headword", () => {
    expect(assets.dictionary.swedishIndex).toMatchObject({
      "akta": ["60"],
      "akta sig": ["60"],
      "aktade sig": ["60"],
    });
    expect(assets.dictionary.swedishIndex).toHaveProperty("aktat sig", ["60"]);
    expect(search("att akta sig")).toMatchObject({ kind: "result", headword: "aktar sig" });
    expect(search("har aktat sig")).toMatchObject({ kind: "result", headword: "aktar sig" });
  });

  it("reads a word Lexin gives no translation in its synonym or else its explanation", () => {
    expect(assets.dictionary.entries.uppsats[0].translation).toBe("научная работа (статья)");
    expect(assets.dictionary.entries.ABF[0].translation)
      .toBe("учебный союз, организующий различные курсы обучения");
    // An explanation describes a word rather than translating it, so a Russian
    // query does not lead to it.
    expect(Object.keys(assets.dictionary.russianIndex)).not.toContain(
      "учебный союз, организующий различные курсы обучения",
    );
  });

  it("reads a cross reference in the translations of the words it points at", () => {
    expect(assets.dictionary.entries.borde[0].translation).toBe("долженствовать · должен");
    // `far subst.` narrows the pointer to the noun, and a list points at each word.
    expect(assets.dictionary.entries.fader[0].translation).toBe("отец");
    expect(assets.dictionary.entries.intar[0].translation).toBe("дом · такси");
    // The adverb `bort` keeps its own translation beside the pointer it joined.
    expect(assets.dictionary.entries.bort.map(({ translation }) => translation))
      .toEqual(["долженствовать · должен", "прочь"]);
  });

  it("follows a cross reference to the variant, the spelling and the pointer it names", () => {
    // `bär 2` names the verb alone.
    expect(assets.dictionary.entries.bar[0].translation).toBe("нести");
    // A pointer to a pointer reads in what that one reads in, and a pair that
    // point at each other settles rather than looping.
    expect(assets.dictionary.entries["bil|besiktning"][0].translation).toBe("техосмотр");
    // Lexin quotes the odd target twice over.
    expect(assets.dictionary.entries["riksförbund"][0].translation).toBe("кооператив");
    // `JO` is spelled exactly so, which the interjection `jo` is not.
    expect(assets.dictionary.entries.ombudsman[0].translation).toBe("омбудсмен");
    // A number Lexin gives no variant names the sense in that place.
    expect(assets.dictionary.entries.inskriver[0].translation).toBe("вписывать");
    // A pointer that spells a form of one word Lexin spells alike means that
    // word: `fick` the past of `får` to get, not `får` the sheep.
    expect(assets.dictionary.entries.fick[0].translation).toBe("получать");
    // A pointer that names a word type still means the sense it is a compound
    // of: `maträtt` the dish, not `rätt` the court.
    expect(assets.dictionary.entries["mat|rätt"][0].translation).toBe("блюдо");
    // A reference can name a spelling Lexin only indexes its target under.
    expect(assets.dictionary.entries.IKC[0].translation).toBe("культурный центр для иммигрантов");
  });

  it("joins a pointer with a synonym to a word of its spelling", () => {
    expect(assets.dictionary.entries.stack.map(({ word }) => word)).toEqual(["42", "42"]);
    // The noun alone answers a Russian query, not the pointer it joined.
    expect(assets.dictionary.russianIndex["оставил"]).toBeUndefined();
  });

  it("leads a Russian query to a pointer that stands as a word of its own", () => {
    expect(assets.dictionary.russianIndex["должен"]).toEqual(["17", "21"]);
    // `bort` the pointer joined the adverb, so `должен` does not lead there.
    expect(assets.dictionary.russianIndex["должен"]).not.toContain("20");
  });

  it("adds the definite plural and comparative forms Lexin leaves implicit", () => {
    expect(assets.dictionary.swedishIndex).toMatchObject({
      arslena: ["6"],
      affektionsvärdena: ["10"],
      babyarna: ["7"],
      babyerna: ["7"],
      böckerna: ["1"],
      sannare: ["5"],
      sannast: ["5"],
      taxina: ["8"],
    });
  });

  it("leaves out forms the pattern would otherwise invent", () => {
    // A noun whose plural already reads as definite, a comparative Lexin
    // spells out, and an adjective marked as already comparative.
    for (const form of [
      "actionen",
      "actionna",
      "affektionsvärdenaen",
      "förenligare",
      "förenligast",
      "taxien",
      "värstare",
      "värstast",
    ]) {
      expect(assets.dictionary.swedishIndex).not.toHaveProperty(form);
    }
  });

  it("resolves a generated inflection to its canonical headword", () => {
    for (const [form, headword] of [["böckerna", "bok"], ["arslena", "arsle"], ["sannare", "sann"]]) {
      expect(search(form)).toMatchObject({ kind: "result", headword });
    }
  });

  it("matches an uppercase headword and translation typed in lower case", () => {
    expect(search("ab")).toMatchObject({ kind: "result", headword: "AB" });
    const ab = { headword: "AB", word: "15" };
    expect(closestSuggestion("ab")).toEqual({ displayWord: "AB", word: ab, language: "sv", exact: true, form: "AB" });
    expect(closestSuggestion("ао")).toEqual({ displayWord: "АО", word: ab, language: "ru", exact: true });
  });

  it("indexes the compounds and derivations Lexin lists under a word as related spellings", () => {
    expect(assets.dictionary.relatedIndex).toMatchObject({
      beroendeframkallande: ["90"],
      beroendeskap: ["90"],
      maträtt: ["48"],
      tingsrätt: ["49"],
    });
    // The word's own forms stay in the Swedish index alone, and Lexin's
    // prefix and suffix spellings, which only split a compound, stay out.
    for (const spelling of ["beroende", "beroendet", "beroendefram", "kallande"]) {
      expect(assets.dictionary.relatedIndex).not.toHaveProperty(spelling);
    }
    expect(search("beroendeframkallande")).toMatchObject({ kind: "result", headword: "beroende" });
    expect(closestSuggestion("beroendeframkallande")).toEqual({
      displayWord: "beroende",
      word: { headword: "beroende", word: "90" },
      language: "sv",
      exact: true,
      form: "beroendeframkallande",
    });
  });

  it("opens the word a query spells before the word that lists it as a compound", () => {
    // `mat|rätt` points at `rätt` the dish, which lists `maträtt` as well.
    const outcome = search("maträtt");
    expect(outcome).toMatchObject({ kind: "result", headword: "mat|rätt" });
    expect(outcome.kind === "result" && outcome.suggestions.map(({ word, exact }) => [word.headword, exact]))
      .toEqual([["mat|rätt", true], ["rätt", false]]);
  });

  it("accepts a shaped asset at startup without inspecting every sense", () => {
    const metadata = { sourceEditionDate: "2010-07-07", attribution: "Lexin", license: "CC BY 4.0" };

    expect(hasDictionaryAssetShape({
      metadata,
      entries: { bok: [{}] },
      swedishIndex: { bok: ["bok"] },
      russianIndex: { "книга": ["bok"] },
      relatedIndex: { bokhylla: ["bok"] },
      wordAliases: { "bok#2": "1" },
    })).toBe(true);
    const indexes = { swedishIndex: {}, russianIndex: {}, relatedIndex: {}, wordAliases: {} };
    expect(hasDictionaryAssetShape({ metadata, entries: { bok: {} }, ...indexes })).toBe(false);
    expect(hasDictionaryAssetShape({ metadata: {}, entries: {}, ...indexes })).toBe(false);
    // Resolving the library reads the aliases, so an asset without them fails here.
    expect(hasDictionaryAssetShape({ metadata, entries: {}, swedishIndex: {}, russianIndex: {}, relatedIndex: {} }))
      .toBe(false);
    expect(hasDictionaryAssetShape({ metadata, entries: {}, swedishIndex: {}, russianIndex: {}, wordAliases: {} }))
      .toBe(false);
    expect(hasDictionaryAssetShape({ metadata, entries: {}, ...indexes, wordAliases: null })).toBe(false);
  });

  it("requires a details asset to carry a source edition and array entries", () => {
    expect(hasDictionaryDetailsShape({ sourceEditionDate: "2010-07-07", entries: { bok: [] } })).toBe(true);
    expect(hasDictionaryDetailsShape({ entries: { bok: [] } })).toBe(false);
    expect(hasDictionaryDetailsShape({ sourceEditionDate: "2010-07-07", entries: { bok: {} } })).toBe(false);
  });
});
