import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dictionaryAssetSchema, dictionaryDetailsAssetSchema } from "../src/dictionary-contract.ts";

type DictionaryReleaseValidation = {
  directory: string;
  sourceEditionDate: string;
};

export async function validateDictionaryRelease({
  directory,
  sourceEditionDate,
}: DictionaryReleaseValidation): Promise<void> {
  const files = await readdir(directory);
  const dictionaryAssets = files.filter((file) => /^lexin-dictionary\.[a-f0-9]{16}\.json$/.test(file));
  if (dictionaryAssets.length !== 1) {
    throw new Error(`Expected one content-hashed dictionary asset, found ${dictionaryAssets.length}.`);
  }
  const detailsAssets = files.filter((file) => /^lexin-details\.[a-f0-9]{16}\.json$/.test(file));
  if (detailsAssets.length !== 1) {
    throw new Error(`Expected one content-hashed dictionary details asset, found ${detailsAssets.length}.`);
  }

  const dictionaryAsset = dictionaryAssets[0];
  const detailsAsset = detailsAssets[0];
  const dictionaryJson = await readFile(resolve(directory, dictionaryAsset), "utf8");
  const dictionaryDigest = createHash("sha256").update(dictionaryJson).digest("hex").slice(0, 16);
  if (dictionaryAsset !== `lexin-dictionary.${dictionaryDigest}.json`) {
    throw new Error("Dictionary asset filename does not match its content digest.");
  }
  const detailsJson = await readFile(resolve(directory, detailsAsset), "utf8");
  const detailsDigest = createHash("sha256").update(detailsJson).digest("hex").slice(0, 16);
  if (detailsAsset !== `lexin-details.${detailsDigest}.json`) {
    throw new Error("Dictionary details asset filename does not match its content digest.");
  }

  const dictionary = dictionaryAssetSchema.parse(JSON.parse(dictionaryJson));
  const details = dictionaryDetailsAssetSchema.parse(JSON.parse(detailsJson));
  if (dictionary.metadata.sourceEditionDate !== sourceEditionDate) {
    throw new Error(
      `Expected source edition ${sourceEditionDate}, found ${dictionary.metadata.sourceEditionDate}.`,
    );
  }
  if (details.sourceEditionDate !== sourceEditionDate) {
    throw new Error(
      `Expected details source edition ${sourceEditionDate}, found ${details.sourceEditionDate}.`,
    );
  }

  const serviceWorker = await readFile(resolve(directory, "sw.js"), "utf8");
  for (const requiredAsset of ["index.html", dictionaryAsset, detailsAsset]) {
    if (!serviceWorker.includes(requiredAsset)) {
      throw new Error(`Service worker does not precache ${requiredAsset}.`);
    }
  }
}

async function main(): Promise<void> {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  await validateDictionaryRelease({
    directory: resolve(repositoryRoot, "dist"),
    sourceEditionDate: "2010-07-07",
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
