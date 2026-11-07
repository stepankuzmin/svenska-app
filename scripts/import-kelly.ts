import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { normalizeSwedishLookupText } from "../src/normalize-lookup-text.ts";

const sourceSchema = z.object({
  LexicalResource: z.object({ Lexicon: z.object({ LexicalEntry: z.array(z.object({
    Lemma: z.object({ FormRepresentation: z.object({ feat: z.array(z.object({ "@_att": z.string(), "@_val": z.string() })) }) }),
  })) }) }),
});

const wordTypes: Record<string, string> = {
  numeral: "räkn.", adjective: "adj.", "noun-en": "subst.", "noun-ett": "subst.", noun: "subst.",
  "noun-en/-ett": "subst.", "proper name": "namn", conj: "konj.", subj: "konj.",
  verb: "verb", "aux verb": "verb", prep: "prep.", pronoun: "pron.", det: "artikel",
  adverb: "adv.", particle: "adv.", interj: "interj.", particip: "adj.",
};

export function kellyFrequencies(xml: string): Record<string, number> {
  const parser = new XMLParser({ ignoreAttributes: false, isArray: (name) => name === "LexicalEntry" || name === "feat" });
  const source = sourceSchema.parse(parser.parse(xml));
  const frequencies: Record<string, number> = {};
  for (const entry of source.LexicalResource.Lexicon.LexicalEntry) {
    const features = Object.fromEntries(entry.Lemma.FormRepresentation.feat.map((feature) => [feature["@_att"], feature["@_val"]]));
    const frequency = Number(features.rawFreq);
    if (!Number.isSafeInteger(frequency) || frequency <= 0) continue;
    const partOfSpeech = wordTypes[features.kellyPartOfSpeech];
    if (!partOfSpeech) throw new Error(`Unknown Kelly word type: ${features.kellyPartOfSpeech}`);
    const article = features.kellyPartOfSpeech === "noun-en" ? "en"
      : features.kellyPartOfSpeech === "noun-ett" ? "ett" : features.gram;
    const prefixes = partOfSpeech === "verb" ? ["att "]
      : features.kellyPartOfSpeech === "noun-en/-ett" ? ["en ", "ett "]
        : article === "en" || article === "ett" ? [`${article} `] : [""];
    for (const prefix of prefixes) {
      const key = `${normalizeSwedishLookupText(prefix + features.writtenForm)}#${partOfSpeech}`;
      frequencies[key] = (frequencies[key] ?? 0) + frequency;
    }
  }
  return frequencies;
}

export async function importKelly(source: string, directory: URL): Promise<void> {
  const xml = await readFile(source, "utf8");
  await mkdir(directory, { recursive: true });
  await writeFile(new URL("frequencies.json", directory), `${JSON.stringify(kellyFrequencies(xml), null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await importKelly(process.argv[2], new URL("../data/kelly/", import.meta.url));
}
