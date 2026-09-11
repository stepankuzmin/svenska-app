import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dictionaryAssetSchema } from "../src/dictionary-contract.ts";

type DictionaryReleaseValidation = {
  basePath: string;
  directory: string;
  sourceEditionDate: string;
};

export async function validateDictionaryRelease({
  basePath,
  directory,
  sourceEditionDate,
}: DictionaryReleaseValidation): Promise<void> {
  const indexHtml = await readFile(resolve(directory, "index.html"), "utf8");
  const assetUrls = [...indexHtml.matchAll(/(?:src|href)=["']([^"']+)/g)].map((match) => match[1]);
  if (assetUrls.some((url) => url.startsWith("/") && !url.startsWith(basePath))) {
    throw new Error("Release index contains a root-relative asset URL.");
  }

  const files = await readdir(directory);
  const dictionaryAssets = files.filter((file) => /^lexin-dictionary\.[a-f0-9]{16}\.json$/.test(file));
  if (dictionaryAssets.length !== 1) {
    throw new Error(`Expected one content-hashed dictionary asset, found ${dictionaryAssets.length}.`);
  }

  const dictionaryAsset = dictionaryAssets[0];
  const dictionaryJson = await readFile(resolve(directory, dictionaryAsset), "utf8");
  const expectedDigest = createHash("sha256").update(dictionaryJson).digest("hex").slice(0, 16);
  if (dictionaryAsset !== `lexin-dictionary.${expectedDigest}.json`) {
    throw new Error("Dictionary asset filename does not match its content digest.");
  }

  const dictionary = dictionaryAssetSchema.parse(JSON.parse(dictionaryJson));
  if (dictionary.metadata.sourceEditionDate !== sourceEditionDate) {
    throw new Error(
      `Expected source edition ${sourceEditionDate}, found ${dictionary.metadata.sourceEditionDate}.`,
    );
  }

  const serviceWorker = await readFile(resolve(directory, "sw.js"), "utf8");
  for (const requiredAsset of ["index.html", dictionaryAsset]) {
    if (!serviceWorker.includes(requiredAsset)) {
      throw new Error(`Service worker does not precache ${requiredAsset}.`);
    }
  }
}

async function main(): Promise<void> {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  await validateDictionaryRelease({
    basePath: process.env.VITE_BASE_PATH ?? "/",
    directory: resolve(repositoryRoot, "dist"),
    sourceEditionDate: "2010-07-07",
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
