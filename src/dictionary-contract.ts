import { z } from "zod";

// Only the build and the release check parse a whole asset, so the schemas
// below are marked pure and stay out of the application bundle, which reads
// the metadata schema alone.
const senseSchema = /* @__PURE__ */ z.object({
  word: z.string(),
  partOfSpeech: z.string(),
  meaning: z.string(),
  translation: z.string(),
});

const bilingualTextSchema = /* @__PURE__ */ z.object({
  swedish: z.string(),
  russian: z.string(),
});

const wordDetailsSchema = /* @__PURE__ */ z.object({
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

export const dictionaryAssetSchema = /* @__PURE__ */ z.object({
  metadata: dictionaryMetadataSchema,
  entries: z.record(z.string(), z.array(senseSchema)),
  // Both indexes lead from a form or translation to the Lexin numbers of the
  // words that carry it, written `headword#number` for a number Lexin gives
  // two spellings.
  swedishIndex: z.record(z.string(), z.array(z.string()).min(1)),
  russianIndex: z.record(z.string(), z.array(z.string()).min(1)),
  // A Lexin number that joined an earlier word of its spelling, written
  // `headword#number`, leads to the number of the word it joined.
  wordAliases: z.record(z.string(), z.string()),
});

export const dictionaryDetailsAssetSchema = /* @__PURE__ */ z.object({
  sourceEditionDate: z.string(),
  entries: z.record(z.string(), z.array(wordDetailsSchema)),
});

export type DictionaryAsset = z.infer<typeof dictionaryAssetSchema>;
export type DictionaryDetailsAsset = z.infer<typeof dictionaryDetailsAssetSchema>;
