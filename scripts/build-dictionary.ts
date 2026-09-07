import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import type { DictionaryAsset } from "../src/dictionary-contract.ts";

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

function childText(value: string | Record<string, unknown> | undefined, child: "Meaning" | "Translation"): string {
  if (typeof value === "object" && value !== null && child in value) {
    return text(value[child]);
  }

  return "";
}

export function buildDictionary({ xml }: { xml: string }): Dictionary {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const source = sourceEditionSchema.parse(parser.parse(xml));
  const dictionary = source.Dictionary;

  const entries: DictionaryAsset["entries"] = {};
  const words = Array.isArray(dictionary.Word) ? dictionary.Word : [dictionary.Word];

  for (const word of words) {
    const headword = word["@_Value"]?.trim();
    if (headword === undefined || headword.length === 0) {
      continue;
    }

    const senses = entries[headword] ?? [];
    senses.push({
      partOfSpeech: word["@_Type"]?.trim() ?? "",
      meaning: childText(word.BaseLang, "Meaning"),
      translation: childText(word.TargetLang, "Translation"),
    });
    entries[headword] = senses;
  }

  return {
    metadata: {
      sourceEditionDate: dictionary["@_Version"],
      attribution: sourceAttribution,
      license: "CC BY 4.0",
    },
    entries,
  };
}

async function main(): Promise<void> {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const xml = await readFile(resolve(repositoryRoot, "data/lexin/swe_rus-2010-07-07.xml"), "utf8");
  const dictionary = buildDictionary({ xml });
  const serializedDictionary = `${JSON.stringify(dictionary)}\n`;
  const digest = createHash("sha256").update(serializedDictionary).digest("hex").slice(0, 16);
  const publicDirectory = resolve(repositoryRoot, "public");
  const assetName = `lexin-dictionary.${digest}.json`;
  const assetUrl = `/${assetName}`;
  const assetOutput = resolve(publicDirectory, assetName);
  const sourceOutput = resolve(repositoryRoot, "src/generated/dictionary-asset.ts");

  await mkdir(publicDirectory, { recursive: true });
  const previousAssets = await readdir(publicDirectory);
  await Promise.all(
    previousAssets
      .filter((file) => file.startsWith("lexin-dictionary.") && file.endsWith(".json") && file !== assetName)
      .map((file) => unlink(resolve(publicDirectory, file))),
  );
  await mkdir(dirname(sourceOutput), { recursive: true });
  await writeFile(assetOutput, serializedDictionary);
  await writeFile(sourceOutput, `export const dictionaryAssetUrl = "${assetUrl}";\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
