import file from "@size-limit/file";
import { readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import sizeLimit from "size-limit";
import { z } from "zod";
import { assetsDirOf } from "./build-output";

const baseDir = process.argv[2];
if (!baseDir) throw new Error("usage: size-report.ts <base checkout> [mobile.json]");
const checksSchema = z.array(z.object({
  name: z.string(), path: z.union([z.string(), z.array(z.string())]), limit: z.string().optional(),
}));
const checksOf = (dir: string) => checksSchema.parse(JSON.parse(readFileSync(join(dir, ".size-limit.json"), "utf8")));
const comparison = z.object({ current: z.number().nonnegative(), base: z.number().nonnegative() });
const timings = process.argv[3]
  ? z.object({ cold: comparison, offline: comparison }).parse(JSON.parse(readFileSync(process.argv[3], "utf8")))
  : undefined;

async function measure(dir: string, paths: string[]): Promise<number> {
  if (!paths.length) return 0;
  const [{ size }] = await sizeLimit(file, paths.map((path) => join(dir, path))) as { size: number }[];
  return size;
}

const dictionaryPattern = /[/\\]lexin-(dictionary|details)\.[^/\\]+\.json$/;
async function assets(dir: string) {
  const files = await Array.fromAsync(glob("**/*", { cwd: await assetsDirOf(dir), withFileTypes: true }));
  const paths = files.filter((file) => file.isFile()).map((file) => join(file.parentPath, file.name));
  const dictionary = (path: string) => dictionaryPattern.test(path);
  return {
    app: await measure(dir, paths.filter((path) => !dictionary(path)).map((path) => relative(resolve(dir), path))),
    dictionary: await measure(dir, paths.filter(dictionary).map((path) => relative(resolve(dir), path))),
  };
}

const kB = (bytes: number) => `${(bytes / 1000).toFixed(2)} kB`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
function row(name: string, current: number, base: number, format: (n: number) => string) {
  return `| ${name} | ${format(base)} | ${format(current)} | ${current > base ? "+" : ""}${format(current - base)} |`;
}
const now = await assets(".");
const was = await assets(baseDir);
console.log("### App performance\n\n| Measure | Main | PR | Diff |\n|---|---|---|---|");
console.log(row("Application assets (brotli)", now.app, was.app, kB));
console.log(row("Dictionary downloads (brotli)", now.dictionary, was.dictionary, kB));
for (const [key, label] of [["cold", "Cold mobile lookup"], ["offline", "Cached offline lookup"]] as const) {
  const timing = timings?.[key];
  console.log(timing ? row(label, timing.current, timing.base, seconds) : `| ${label} | Not measured | Not measured | – |`);
}
console.log("\nTimings: median of 3 fresh Pixel 7 browser contexts per mode and build, 4× CPU slowdown; cold: 1.6 Mbps down, 150 ms latency. Compressed (gzip) Vite production preview, not a physical phone or the deployed edge. Cold service workers are blocked so every download is network-throttled. Offline uses a separate context with the normal service worker, a cached reload and a different lookup. A lookup completes when its result cards are visible.\n\n<details>\n<summary>Startup size guards</summary>\n\n| Measure | Main | PR | Diff |\n|---|---|---|---|");
async function guard(dir: string, check: z.infer<typeof checksSchema>[number] | undefined) {
  if (!check) return 0;
  const paths = typeof check.path === "string" ? [check.path] : check.path;
  return measure(dir, [...new Set(await Array.fromAsync(glob(paths, { cwd: dir })))]);
}
const baseChecks = checksOf(baseDir);
for (const check of checksOf(".").filter((check) => check.limit)) {
  const base = baseChecks.find((candidate) => candidate.name === check.name);
  console.log(row(check.name, await guard(".", check), await guard(baseDir, base), kB));
}
console.log("\nEnforced by `check:size`. Application assets count each shipped file once, including optional features and the service worker; dictionary files are separate.\n\n</details>");
