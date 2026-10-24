import type { DictionaryAsset, DictionaryDetailsAsset } from "./dictionary-contract";

function looksLikeRecordOfArrays(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  // Samples the first key rather than listing 64k of them on the startup path.
  for (const key in value) {
    return Array.isArray((value as Record<string, unknown>)[key]);
  }

  return true;
}

// The app checks the metadata by hand so the schema library stays out of its
// bundle; the build parses the whole asset with the schema.
function hasMetadataShape(value: unknown): value is DictionaryAsset["metadata"] {
  const metadata = (value ?? {}) as Partial<DictionaryAsset["metadata"]>;
  return typeof metadata.sourceEditionDate === "string" &&
    typeof metadata.attribution === "string" &&
    metadata.license === "CC BY 4.0";
}

// The release script deep-parses these exact bytes and the asset filename is
// their content digest, so startup only confirms the file is the right shape:
// resolving the library reads `wordAliases`, so it must be an object.
export function hasDictionaryAssetShape(value: unknown): value is DictionaryAsset {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const asset = value as Partial<DictionaryAsset>;
  return (
    Object(asset.wordAliases) === asset.wordAliases &&
    hasMetadataShape(asset.metadata) &&
    looksLikeRecordOfArrays(asset.entries) &&
    looksLikeRecordOfArrays(asset.swedishIndex) &&
    looksLikeRecordOfArrays(asset.russianIndex) &&
    looksLikeRecordOfArrays(asset.relatedIndex)
  );
}

export function hasDictionaryDetailsShape(value: unknown): value is DictionaryDetailsAsset {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const asset = value as Partial<DictionaryDetailsAsset>;
  return typeof asset.sourceEditionDate === "string" && looksLikeRecordOfArrays(asset.entries);
}
