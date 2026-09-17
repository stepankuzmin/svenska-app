import { z } from "zod";

const senseSchema = z.object({
  word: z.string(),
  partOfSpeech: z.string(),
  meaning: z.string(),
  translation: z.string(),
});

const bilingualTextSchema = z.object({
  swedish: z.string(),
  russian: z.string(),
});

const wordDetailsSchema = z.object({
  phonetic: z.string(),
  article: z.string(),
  inflections: z.array(z.string()),
  examples: z.array(bilingualTextSchema),
  compounds: z.array(bilingualTextSchema),
});

export const dictionaryMetadataSchema = z.object({
  sourceEditionDate: z.string(),
  attribution: z.string(),
  license: z.literal("CC BY 4.0"),
});

export const dictionaryAssetSchema = z.object({
  metadata: dictionaryMetadataSchema,
  entries: z.record(z.string(), z.array(senseSchema)),
  swedishIndex: z.record(z.string(), z.array(z.string()).min(1)),
  russianIndex: z.record(z.string(), z.array(z.string()).min(1)),
});

export const dictionaryDetailsAssetSchema = z.object({
  sourceEditionDate: z.string(),
  entries: z.record(z.string(), z.array(wordDetailsSchema)),
});

export type DictionaryAsset = z.infer<typeof dictionaryAssetSchema>;
export type DictionaryDetailsAsset = z.infer<typeof dictionaryDetailsAssetSchema>;
