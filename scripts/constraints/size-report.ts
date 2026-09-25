// Size report: each .size-limit.json check measured by size-limit in this build
// and in a base build, as a markdown table for the pull request comment.
// `npm run check:size` gates the limits; this only reports.
import file from "@size-limit/file";
import { readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { join } from "node:path";
import sizeLimit from "size-limit";

const baseDir = process.argv[2];
if (!baseDir) {
  console.error("usage: size-report.ts <base checkout>");
  process.exit(2);
}

const checks: { name: string; path: string; limit?: string }[] = JSON.parse(readFileSync(".size-limit.json", "utf8"));

// Brotli bytes of the files matching `pattern` under `dir`, or undefined when none match.
async function measure(dir: string, pattern: string): Promise<number | undefined> {
  const files = (await Array.fromAsync(glob(pattern, { cwd: dir }))).map((path) => join(dir, path));
  if (files.length === 0) return undefined;
  const [{ size }] = (await sizeLimit(file, files)) as { size: number }[];
  return size;
}

const kB = (bytes: number) => `${(bytes / 1000).toFixed(2)} kB`;

console.log("### Bundle size (brotli)\n\n| Check | Size | Change | Limit |\n|-------|------|--------|-------|");
for (const { name, path, limit } of checks) {
  const now = await measure(".", path);
  const was = await measure(baseDir, path);
  const change =
    now === undefined ? "removed" : was === undefined ? "new" : `${now > was ? "+" : ""}${kB(now - was)}`;
  console.log(`| ${name} | ${now === undefined ? "–" : kB(now)} | ${change} | ${limit ?? ""} |`);
}
