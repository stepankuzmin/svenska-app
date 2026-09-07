import { z } from "zod";

export const senseSchema = z.object({
  partOfSpeech: z.string(),
  meaning: z.string(),
  translation: z.string(),
});

export const dictionaryAssetSchema = z.object({
  metadata: z.object({
    sourceEditionDate: z.string(),
    attribution: z.string(),
    license: z.literal("CC BY 4.0"),
  }),
  entries: z.record(z.string(), z.array(senseSchema)),
});

export type DictionaryAsset = z.infer<typeof dictionaryAssetSchema>;
