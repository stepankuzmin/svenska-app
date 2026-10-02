import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import type { DictionaryAsset, DictionaryDetailsAsset } from "../src/dictionary-contract.ts";
import { cleanLexinText, normalizeLookupText, normalizeSwedishLookupText } from "../src/normalize-lookup-text.ts";
import { crossReferenceType, wordKey } from "../src/words.ts";

const sourceAttribution = "Lexin: Svensk-ryskt lexikon — Institutet för språk och folkminnen (Språkrådet)";

const languageSchema = z.record(z.string(), z.unknown());

const xmlWordSchema = z.object({
  "@_ID": z.union([z.string(), z.number()]).optional(),
  "@_Type": z.string().optional(),
  "@_Value": z.string().optional(),
  "@_Variant": z.union([z.string(), z.number()]).optional(),
  BaseLang: z.union([z.string(), languageSchema]).optional(),
  TargetLang: z.union([z.string(), languageSchema]).optional(),
});

const sourceEditionSchema = z.object({
  Dictionary: z.object({
    "@_Version": z.string(),
    Word: z.union([xmlWordSchema, z.array(xmlWordSchema).min(1)]),
  }),
});

function text(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map(text).join(" ").trim();
  }

  if (typeof value === "object" && value !== null && "#text" in value) {
    return text(value["#text"]);
  }

  return "";
}

function childText(
  value: string | Record<string, unknown> | undefined,
  child: "Meaning" | "Phonetic" | "Translation" | "Usage",
): string {
  if (typeof value === "object" && value !== null && child in value) {
    return text(value[child]);
  }

  return "";
}

function childTexts(
  value: string | Record<string, unknown> | undefined,
  child: "Explanation" | "Reference" | "Synonym",
): unknown[] {
  if (typeof value !== "object" || value === null || !(child in value)) {
    return [];
  }

  return Array.isArray(value[child]) ? value[child] : [value[child]];
}

const quotedText = /^"(.*)"$/s;
const referencedVariants = /\s*\(([^)]*)\)$|\s+(\d+)$/;

// Lexin gives most words a translation, some only a synonym — `uppsats`,
// `научная работа (статья)` — and an abbreviation or a name now and then only
// an explanation in quotes. A word reads in the first of them Lexin gives, and
// only a translation or a synonym names it in the Russian index, since an
// explanation describes the word rather than translating it.
function russianText(target: string | Record<string, unknown> | undefined): {
  translation: string;
  indexed: boolean;
} {
  const translation = childText(target, "Translation");
  const synonyms = childTexts(target, "Synonym").map(text).filter((item) => item.length > 0);
  if (translation.length > 0 || synonyms.length > 0) {
    return { translation: translation.length > 0 ? translation : synonyms.join(", "), indexed: true };
  }

  const explanations = childTexts(target, "Explanation")
    .map((explanation) => text(explanation).replace(quotedText, "$1"))
    .filter((item) => item.length > 0);
  return { translation: explanations.join(", "), indexed: false };
}

type ReferencedWord = { spelling: string; partOfSpeech: string; variants: string[] };

// A cross reference names the words it points at, `säger upp` or several at
// once, `intar, tar in`, and now and then narrows one by the variant Lexin
// numbers its spelling with, `bör (1,2)` and `bär 2`, or by its word type,
// `den pron.`. Lexin quotes the odd one twice over: `&quot;LRF&quot;`.
function referencedWords({
  base,
  wordTypes,
}: {
  base: string | Record<string, unknown> | undefined;
  wordTypes: ReadonlySet<string>;
}): ReferencedWord[] {
  return childTexts(base, "Reference").flatMap((reference) => {
    if (typeof reference !== "object" || reference === null || !("@_TYPE" in reference) ||
      reference["@_TYPE"] !== "see" || !("@_VALUE" in reference)) {
      return [];
    }

    return text(reference["@_VALUE"]).replaceAll("&quot;", "").split(", ").map((value) => {
      const numbered = referencedVariants.exec(value);
      const variants = (numbered?.[1] ?? numbered?.[2] ?? "").split(",").map((variant) => variant.trim())
        .filter((variant) => variant.length > 0);
      const target = (numbered === null ? value : value.slice(0, numbered.index)).trim();
      const typeStart = target.lastIndexOf(" ");
      const partOfSpeech = target.slice(typeStart + 1);
      return typeStart > 0 && wordTypes.has(partOfSpeech)
        ? { spelling: target.slice(0, typeStart), partOfSpeech, variants }
        : { spelling: target, partOfSpeech: "", variants };
    });
  });
}

// A cross reference carries no translation of its own, so it reads in the
// translations of the words it points at. A target spelled exactly so wins
// over one that only reads alike, so `JO` is not taken for the interjection
// `jo`. A target that is itself a pointer lends what it reads in once it has
// it, `bil|besiktning` through `årlig kontrollbesiktning`, so the pointers
// settle round by round until none gains a translation. A borrowed
// translation stays out of the Russian index: a Russian query offers the word
// itself rather than every pointer to it.
function borrowTranslations({
  entries,
  variants,
  crossReferences,
}: {
  entries: DictionaryAsset["entries"];
  variants: Readonly<Record<string, readonly string[]>>;
  crossReferences: readonly CrossReference[];
}): void {
  const headwordsBySpelling = new Map<string, string[]>();
  const headwordsByForm = new Map<string, string[]>();
  for (const headword of Object.keys(entries)) {
    for (const [index, key] of [
      [headwordsBySpelling, cleanLexinText(headword)],
      [headwordsByForm, normalizeSwedishLookupText(headword)],
    ] as const) {
      index.set(key, [...(index.get(key) ?? []), headword]);
    }
  }

  const translationsOf = ({ spelling, partOfSpeech, variants: wanted }: ReferencedWord) =>
    (headwordsBySpelling.get(cleanLexinText(spelling)) ??
      headwordsByForm.get(normalizeSwedishLookupText(spelling)) ?? []).flatMap((target) => {
      const matching = entries[target].filter((targetSense, index) =>
        (partOfSpeech.length === 0 || targetSense.partOfSpeech === partOfSpeech) &&
        (wanted.length === 0 || wanted.includes(variants[target]?.[index] ?? "")));
      const words = matching.filter((targetSense) => targetSense.partOfSpeech !== crossReferenceType);
      return (words.length > 0 ? words : matching).map((targetSense) => targetSense.translation);
    });

  let pending = crossReferences.filter(({ headword, senseIndex }) =>
    entries[headword][senseIndex].translation.length === 0);
  while (pending.length > 0) {
    const settled = pending.filter(({ headword, senseIndex, targets }) => {
      const translations = targets.flatMap(translationsOf).filter((item) => item.length > 0);
      entries[headword][senseIndex].translation = [...new Set(translations)].join(" · ");
      return translations.length > 0;
    });
    if (settled.length === 0) {
      break;
    }
    pending = pending.filter((crossReference) => !settled.includes(crossReference));
  }
}

type CrossReference = {
  headword: string;
  senseIndex: number;
  targets: ReferencedWord[];
};

function inflectionGroups(value: string | Record<string, unknown> | undefined): string[][] {
  if (typeof value !== "object" || value === null || !("Inflection" in value)) {
    return [];
  }

  const inflections = Array.isArray(value.Inflection) ? value.Inflection : [value.Inflection];
  return inflections.map((inflection) => {
    if (typeof inflection !== "object" || inflection === null) {
      const inflectionText = text(inflection);
      return inflectionText.length === 0 ? [] : [inflectionText];
    }

    const primary = "#text" in inflection ? text(inflection["#text"]) : "";
    const variants = "Variant" in inflection
      ? (Array.isArray(inflection.Variant) ? inflection.Variant : [inflection.Variant]).map(text)
      : [];
    return [primary, ...variants].filter((item) => item.length > 0);
  });
}

// Lexin lists a noun as definite singular and plural, leaving the definite
// plural to the pattern. A word card reads as a full paradigm only once that
// form is spelled out, so it joins the inflections rather than the index alone.
function definitePluralTexts({
  headword,
  partOfSpeech,
  inflections,
}: {
  headword: string;
  partOfSpeech: string;
  inflections: readonly string[][];
}): string[] {
  if (partOfSpeech === "subst." && inflections.length === 2) {
    const normalizedHeadword = normalizeSwedishLookupText(headword);
    const normalizedDefiniteSingular = normalizeSwedishLookupText(inflections[0][0] ?? "");
    const normalizedSecondGroup = new Set(
      inflections[1].map(normalizeSwedishLookupText),
    );
    const alreadyIncludesDefinitePlural = inflections[0].some((plural) => {
      const normalizedPlural = normalizeSwedishLookupText(plural);
      const definitePlural = normalizedPlural.endsWith("r")
        ? `${normalizedPlural}na`
        : normalizedPlural === `${normalizedHeadword}n`
          ? `${normalizedPlural}a`
          : `${normalizedPlural}en`;
      return normalizedSecondGroup.has(definitePlural);
    });
    if (alreadyIncludesDefinitePlural) {
      return [];
    }

    return inflections[1].flatMap((plural) => {
      const normalizedPlural = normalizeSwedishLookupText(plural);
      if (normalizedPlural.endsWith("r")) {
        return `${plural}na`;
      }
      if (normalizedPlural === `${normalizedHeadword}n`) {
        return `${plural}a`;
      }
      if (normalizedPlural === normalizedHeadword) {
        if (
          normalizedDefiniteSingular.startsWith(normalizedHeadword) &&
          normalizedDefiniteSingular.endsWith("n")
        ) {
          return `${plural}na`;
        }
        if (
          normalizedDefiniteSingular.startsWith(normalizedHeadword) &&
          normalizedDefiniteSingular.endsWith("t")
        ) {
          return `${plural}en`;
        }
        return [];
      }
      return `${plural}en`;
    });
  }

  return [];
}

// An adjective Lexin lists in the positive implies a comparative and a
// superlative. They belong to a paradigm the card does not show, so only the
// index carries them.
function comparativeTexts({
  partOfSpeech,
  inflections,
  usage,
}: {
  partOfSpeech: string;
  inflections: readonly string[][];
  usage: string;
}): string[] {
  const normalizedUsage = normalizeLookupText(usage);
  if (
    partOfSpeech !== "adj." ||
    inflections.length !== 2 ||
    normalizedUsage.includes("kompar") ||
    normalizedUsage.includes("superlativ")
  ) {
    return [];
  }

  return inflections[1].flatMap((plural) => {
    if (!plural.endsWith("a")) {
      return [];
    }

    const stem = plural.slice(0, -1);
    return [`${stem}are`, `${stem}ast`];
  });
}

const pluralUsage = /^plur(al|\.)/i;

// Lexin spells out a noun's gender only through its definite singular: an
// en-word ends it with -n, an ett-word with -t. A word Lexin marks as plural
// lists a definite plural instead, so it opens without an article.
function nounArticle({
  partOfSpeech,
  inflections,
  usage,
}: {
  partOfSpeech: string;
  inflections: readonly string[][];
  usage: string;
}): string {
  if (partOfSpeech !== "subst." || inflections.length === 0) {
    return "";
  }

  if (inflections.length === 1 && pluralUsage.test(usage.trim())) {
    return "";
  }

  const definiteSingular = cleanLexinText(inflections[0][0] ?? "");
  if (definiteSingular.endsWith("t")) {
    return "ett";
  }

  return definiteSingular.endsWith("n") ? "en" : "";
}

// Lexin numbers every word and repeats that number on each of its senses,
// which is the stable identity a lookup library keeps. A cross reference
// carries no meaning, translation or forms of its own, so it joins the first
// word of its spelling rather than standing as a word nobody can read.
//
// Lexin now and then numbers the meanings of one word apart: `bör` the duty
// and `bör` the expectation inflect `böra, borde, bort` alike. A spelling
// Lexin inflects one way keeps one word, so a number whose paradigm — word
// type, article and forms — repeats an earlier number's joins that word, and
// `joined` names the number it joined so a library that kept it finds it.
function wordsOfEntry({
  senses,
  details,
}: {
  senses: readonly { word: string; partOfSpeech: string; meaning: string; translation: string }[];
  details: readonly { article: string; inflections: readonly string[] }[];
}): { words: string[]; joined: [string, string][] } {
  const hasContent = (index: number) =>
    senses[index].meaning.length > 0 ||
    senses[index].translation.length > 0 ||
    (details[index]?.inflections.length ?? 0) > 0;
  const numbered = [...new Set(senses.map((sense) => sense.word))];
  const words = numbered.filter((word) =>
    senses.some((sense, index) => sense.word === word && hasContent(index)));
  const [firstWord] = words.length > 0 ? words : numbered;

  const paradigmOf = (word: string) => {
    const indexes = senses.flatMap((sense, index) => sense.word === word && hasContent(index) ? [index] : []);
    const sorted = (values: readonly string[]) => [...new Set(values)].sort().join(",");
    return [
      sorted(indexes.map((index) => senses[index].partOfSpeech)),
      sorted(indexes.map((index) => details[index]?.article ?? "")),
      sorted(indexes.flatMap((index) => details[index]?.inflections ?? [])),
    ].join("|");
  };
  const wordsByParadigm = new Map<string, string>();
  const joinedWords = new Map(words.map((word) => {
    const paradigm = paradigmOf(word);
    const known = wordsByParadigm.get(paradigm) ?? word;
    wordsByParadigm.set(paradigm, known);
    return [word, known];
  }));

  return {
    words: senses.map((sense) => joinedWords.get(sense.word) ?? firstWord),
    joined: [...joinedWords].filter(([word, known]) => word !== known),
  };
}

// Lexin gives a number to one word, bar the odd pair it spells with and
// without a segment marker and gives one number although they mean different
// things: `hård|kokt` of an egg and `hårdkokt` of a novel.
function sharedWordNumbers(entries: DictionaryAsset["entries"]): Set<string> {
  const headwordsByNumber = new Map<string, string>();
  const shared = new Set<string>();
  for (const [headword, senses] of Object.entries(entries)) {
    for (const { word } of senses) {
      const known = headwordsByNumber.get(word) ?? headword;
      if (known !== headword) {
        shared.add(word);
      }
      headwordsByNumber.set(word, known);
    }
  }
  return shared;
}

// An index names the sense a form or translation came from until the build
// knows which word that sense belongs to.
type IndexedSense = { headword: string; senseIndex: number };

function addToIndex({
  index,
  form,
  sense,
}: {
  index: Map<string, IndexedSense[]>;
  form: string;
  sense: IndexedSense;
}): void {
  const displayForm = cleanLexinText(form).trim();
  if (displayForm.length === 0) {
    return;
  }

  const indexedSenses = index.get(displayForm) ?? [];
  indexedSenses.push(sense);
  index.set(displayForm, indexedSenses);
}

// A form or translation leads to the Lexin numbers of the words whose senses
// carry it, so choosing it opens that word rather than every word its spelling
// holds. A number Lexin gives two spellings names its spelling as well.
function wordIndex({
  index,
  entries,
  shared,
}: {
  index: ReadonlyMap<string, readonly IndexedSense[]>;
  entries: DictionaryAsset["entries"];
  shared: ReadonlySet<string>;
}): Record<string, string[]> {
  const words: Record<string, string[]> = {};
  for (const [form, indexedSenses] of index) {
    words[form] = [...new Set(indexedSenses.map(({ headword, senseIndex }) => {
      const { word } = entries[headword][senseIndex];
      return shared.has(word) ? wordKey({ headword, word }) : word;
    }))];
  }
  return words;
}

function childValues(
  value: string | Record<string, unknown> | undefined,
  child: "Compound" | "Example",
): unknown[] {
  if (typeof value !== "object" || value === null || !(child in value)) {
    return [];
  }

  return Array.isArray(value[child]) ? value[child] : [value[child]];
}

function identifier(value: unknown): string {
  if (typeof value !== "object" || value === null || !("@_ID" in value)) {
    return "";
  }

  return text(value["@_ID"]);
}

function pairedTexts({
  base,
  target,
  child,
}: {
  base: string | Record<string, unknown> | undefined;
  target: string | Record<string, unknown> | undefined;
  child: "Compound" | "Example";
}): Array<{ swedish: string; russian: string }> {
  const baseValues = childValues(base, child);
  const targetValues = childValues(target, child);
  const targetsById = new Map(
    targetValues.flatMap((value) => {
      const id = identifier(value);
      return id.length === 0 ? [] : [[id, text(value)] as const];
    }),
  );

  return baseValues.flatMap((value, index) => {
    const swedish = cleanLexinText(text(value));
    if (swedish.length === 0) {
      return [];
    }

    const id = identifier(value);
    return [{
      swedish,
      russian: (id.length > 0 ? targetsById.get(id) : undefined) ?? text(targetValues[index]),
    }];
  });
}

export function buildDictionaryAssets({ xml }: { xml: string }): {
  dictionary: DictionaryAsset;
  details: DictionaryDetailsAsset;
} {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const source = sourceEditionSchema.parse(parser.parse(xml));
  const sourceDictionary = source.Dictionary;

  const entries: DictionaryAsset["entries"] = {};
  const detailEntries: DictionaryDetailsAsset["entries"] = {};
  const swedishIndex = new Map<string, IndexedSense[]>();
  const russianIndex = new Map<string, IndexedSense[]>();
  const wordAliases: DictionaryAsset["wordAliases"] = {};
  const crossReferences: CrossReference[] = [];
  const variants: Record<string, string[]> = {};
  const words = Array.isArray(sourceDictionary.Word) ? sourceDictionary.Word : [sourceDictionary.Word];
  const wordTypes = new Set(words.map((word) => word["@_Type"]?.trim() ?? ""));

  for (const word of words) {
    const headword = word["@_Value"]?.trim();
    if (headword === undefined || headword.length === 0) {
      continue;
    }

    const partOfSpeech = word["@_Type"]?.trim() ?? "";
    const inflections = inflectionGroups(word.BaseLang);
    const usage = childText(word.BaseLang, "Usage");
    const inflectionTexts = [
      ...inflections.flat(),
      ...definitePluralTexts({ headword, partOfSpeech, inflections }),
    ];
    const senses = entries[headword] ?? [];
    const sense = { headword, senseIndex: senses.length };
    const wordDetails = detailEntries[headword] ?? [];
    const { translation, indexed } = russianText(word.TargetLang);
    variants[headword] = [...(variants[headword] ?? []), text(word["@_Variant"])];
    if (partOfSpeech === crossReferenceType) {
      crossReferences.push({
        ...sense,
        targets: referencedWords({ base: word.BaseLang, wordTypes }),
      });
    }
    senses.push({
      word: text(word["@_ID"]),
      partOfSpeech,
      meaning: childText(word.BaseLang, "Meaning"),
      translation,
    });
    wordDetails.push({
      phonetic: childText(word.BaseLang, "Phonetic"),
      article: nounArticle({ partOfSpeech, inflections, usage }),
      inflections: inflectionTexts,
      examples: pairedTexts({ base: word.BaseLang, target: word.TargetLang, child: "Example" }),
      compounds: pairedTexts({ base: word.BaseLang, target: word.TargetLang, child: "Compound" }),
    });
    entries[headword] = senses;
    detailEntries[headword] = wordDetails;

    for (const form of [
      headword,
      ...inflectionTexts,
      ...comparativeTexts({ partOfSpeech, inflections, usage }),
    ]) {
      addToIndex({ index: swedishIndex, form, sense });
    }

    if (indexed) {
      addToIndex({ index: russianIndex, form: translation, sense });
    }
  }

  for (const [headword, senses] of Object.entries(entries)) {
    const { words, joined } = wordsOfEntry({ senses, details: detailEntries[headword] ?? [] });
    senses.forEach((sense, index) => {
      sense.word = words[index];
    });
    for (const [word, known] of joined) {
      wordAliases[wordKey({ headword, word })] = known;
    }
  }
  borrowTranslations({ entries, variants, crossReferences });
  const shared = sharedWordNumbers(entries);

  return {
    dictionary: {
      metadata: {
        sourceEditionDate: sourceDictionary["@_Version"],
        attribution: sourceAttribution,
        license: "CC BY 4.0",
      },
      entries,
      swedishIndex: wordIndex({ index: swedishIndex, entries, shared }),
      russianIndex: wordIndex({ index: russianIndex, entries, shared }),
      wordAliases,
    },
    details: {
      sourceEditionDate: sourceDictionary["@_Version"],
      entries: detailEntries,
    },
  };
}

async function main(): Promise<void> {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const xml = await readFile(resolve(repositoryRoot, "data/lexin/swe_rus-2010-07-07.xml"), "utf8");
  const { dictionary, details } = buildDictionaryAssets({ xml });
  const serializedDictionary = `${JSON.stringify(dictionary)}\n`;
  const serializedDetails = `${JSON.stringify(details)}\n`;
  const dictionaryDigest = createHash("sha256").update(serializedDictionary).digest("hex").slice(0, 16);
  const detailsDigest = createHash("sha256").update(serializedDetails).digest("hex").slice(0, 16);
  const publicDirectory = resolve(repositoryRoot, "public");
  const dictionaryAssetName = `lexin-dictionary.${dictionaryDigest}.json`;
  const detailsAssetName = `lexin-details.${detailsDigest}.json`;
  const sourceOutput = resolve(repositoryRoot, "src/generated/dictionary-asset.ts");

  await mkdir(publicDirectory, { recursive: true });
  const previousAssets = await readdir(publicDirectory);
  const currentAssets = new Set([dictionaryAssetName, detailsAssetName]);
  await Promise.all(
    previousAssets
      .filter((file) =>
        (file.startsWith("lexin-dictionary.") || file.startsWith("lexin-details.")) &&
        file.endsWith(".json") &&
        !currentAssets.has(file),
      )
      .map((file) => unlink(resolve(publicDirectory, file))),
  );
  await mkdir(dirname(sourceOutput), { recursive: true });
  await Promise.all([
    writeFile(resolve(publicDirectory, dictionaryAssetName), serializedDictionary),
    writeFile(resolve(publicDirectory, detailsAssetName), serializedDetails),
  ]);
  await writeFile(
    sourceOutput,
    `export const dictionaryAssetUrl = \`${"${import.meta.env.BASE_URL}"}${dictionaryAssetName}\`;\n` +
      `export const dictionaryDetailsAssetUrl = \`${"${import.meta.env.BASE_URL}"}${detailsAssetName}\`;\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
