import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import type { DictionaryAsset, DictionaryDetailsAsset } from "../src/dictionary-contract.ts";
import { normalizeLookupText } from "../src/normalize-lookup-text.ts";

const sourceAttribution = "Lexin: Svensk-ryskt lexikon — Institutet för språk och folkminnen (Språkrådet)";

const languageSchema = z.record(z.string(), z.unknown());

const xmlWordSchema = z.object({
  "@_Type": z.string().optional(),
  "@_Value": z.string().optional(),
  BaseLang: z.union([z.string(), languageSchema]).optional(),
  TargetLang: z.union([z.string(), languageSchema]).optional(),
});

const sourceEditionSchema = z.object({
  Dictionary: z.object({
    "@_Version": z.string(),
    Word: z.union([xmlWordSchema, z.array(xmlWordSchema).min(1)]),
  }),
});

export type Dictionary = DictionaryAsset;

type DictionaryAssets = {
  dictionary: DictionaryAsset;
  details: DictionaryDetailsAsset;
};

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

function generatedInflectionTexts({
  headword,
  partOfSpeech,
  inflections,
  usage,
}: {
  headword: string;
  partOfSpeech: string;
  inflections: readonly string[][];
  usage: string;
}): string[] {
  if (partOfSpeech === "subst." && inflections.length === 2) {
    const normalizedHeadword = normalizeLookupText(headword.replaceAll("|", ""));
    const normalizedDefiniteSingular = normalizeLookupText(
      (inflections[0][0] ?? "").replaceAll("|", ""),
    );
    const normalizedSecondGroup = new Set(
      inflections[1].map((form) => normalizeLookupText(form.replaceAll("|", ""))),
    );
    const alreadyIncludesDefinitePlural = inflections[0].some((plural) => {
      const normalizedPlural = normalizeLookupText(plural.replaceAll("|", ""));
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
      const normalizedPlural = normalizeLookupText(plural.replaceAll("|", ""));
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

  const normalizedUsage = normalizeLookupText(usage);
  if (
    partOfSpeech === "adj." &&
    inflections.length === 2 &&
    !normalizedUsage.includes("kompar") &&
    !normalizedUsage.includes("superlativ")
  ) {
    return inflections[1].flatMap((plural) => {
      if (!plural.endsWith("a")) {
        return [];
      }

      const stem = plural.slice(0, -1);
      return [`${stem}are`, `${stem}ast`];
    });
  }

  return [];
}

function addToIndex({
  index,
  form,
  headword,
}: {
  index: Record<string, string[]>;
  form: string;
  headword: string;
}): void {
  const displayForm = form.replaceAll("|", "").trim();
  if (displayForm.length === 0) {
    return;
  }

  const matchingHeadwords = index[displayForm] ?? [];
  if (!matchingHeadwords.includes(headword)) {
    matchingHeadwords.push(headword);
  }
  index[displayForm] = matchingHeadwords;
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
    const swedish = text(value).replaceAll("|", "");
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

export function buildDictionaryAssets({ xml }: { xml: string }): DictionaryAssets {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const source = sourceEditionSchema.parse(parser.parse(xml));
  const sourceDictionary = source.Dictionary;

  const entries: DictionaryAsset["entries"] = {};
  const detailEntries: DictionaryDetailsAsset["entries"] = {};
  const swedishIndex: DictionaryAsset["swedishIndex"] = {};
  const russianIndex: DictionaryAsset["russianIndex"] = {};
  const words = Array.isArray(sourceDictionary.Word) ? sourceDictionary.Word : [sourceDictionary.Word];

  for (const word of words) {
    const headword = word["@_Value"]?.trim();
    if (headword === undefined || headword.length === 0) {
      continue;
    }

    const partOfSpeech = word["@_Type"]?.trim() ?? "";
    const inflections = inflectionGroups(word.BaseLang);
    const senses = entries[headword] ?? [];
    const wordDetails = detailEntries[headword] ?? [];
    const translation = childText(word.TargetLang, "Translation");
    senses.push({
      partOfSpeech,
      meaning: childText(word.BaseLang, "Meaning"),
      translation,
    });
    wordDetails.push({
      phonetic: childText(word.BaseLang, "Phonetic"),
      inflections: inflections.flat(),
      examples: pairedTexts({ base: word.BaseLang, target: word.TargetLang, child: "Example" }),
      compounds: pairedTexts({ base: word.BaseLang, target: word.TargetLang, child: "Compound" }),
    });
    entries[headword] = senses;
    detailEntries[headword] = wordDetails;

    for (const form of [
      headword,
      ...inflections.flat(),
      ...generatedInflectionTexts({
        headword,
        partOfSpeech,
        inflections,
        usage: childText(word.BaseLang, "Usage"),
      }),
    ]) {
      addToIndex({ index: swedishIndex, form, headword });
    }

    const normalizedTranslation = normalizeLookupText(translation);
    if (normalizedTranslation.length > 0) {
      const matchingHeadwords = russianIndex[normalizedTranslation] ?? [];
      if (!matchingHeadwords.includes(headword)) {
        matchingHeadwords.push(headword);
      }
      russianIndex[normalizedTranslation] = matchingHeadwords;
    }
  }

  return {
    dictionary: {
      metadata: {
        sourceEditionDate: sourceDictionary["@_Version"],
        attribution: sourceAttribution,
        license: "CC BY 4.0",
      },
      entries,
      swedishIndex,
      russianIndex,
    },
    details: {
      sourceEditionDate: sourceDictionary["@_Version"],
      entries: detailEntries,
    },
  };
}

export function buildDictionary({ xml }: { xml: string }): Dictionary {
  return buildDictionaryAssets({ xml }).dictionary;
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
