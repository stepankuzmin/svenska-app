import file from "@size-limit/file";
import { readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import sizeLimit from "size-limit";
import { z } from "zod";

const baseDir = process.argv[2];
if (!baseDir) throw new Error("usage: size-report.ts <base checkout> [mobile.json]");
const checks = z.array(z.object({
  name: z.string(), path: z.union([z.string(), z.array(z.string())]), limit: z.string().optional(),
})).parse(JSON.parse(readFileSync(".size-limit.json", "utf8")));
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
  const files = await Array.fromAsync(glob("dist/**/*", { cwd: resolve(dir), withFileTypes: true }));
  const paths = files.filter((file) => file.isFile()).map((file) => join(file.parentPath, file.name));
  const dictionary = (path: string) => dictionaryPattern.test(path);
  return {
    app: await measure(dir, paths.filter((path) => !dictionary(path)).map((path) => relative(resolve(dir), path))),
    dictionary: await measure(dir, paths.filter(dictionary).map((path) => relative(resolve(dir), path))),
  };
}

const kB = (bytes: number) => `${(bytes / 1000).toFixed(2)} kB`;
const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
function row(name: string, current: number, base: number, format: (n: number) => string, limit = "Report only") {
  return `| ${name} | ${format(current)} | ${current > base ? "+" : ""}${format(current - base)} | ${limit} |`;
}
const now = await assets(".");
const was = await assets(baseDir);
console.log("### App performance\n\n| Measure | This PR | Change | Budget |\n|---|---|---|---|");
console.log(row("Application assets (brotli)", now.app, was.app, kB));
console.log(row("Dictionary downloads (brotli)", now.dictionary, was.dictionary, kB));
for (const [key, label] of [["cold", "Cold mobile lookup"], ["offline", "Cached offline lookup"]] as const) {
  const timing = timings?.[key];
  console.log(timing ? row(label, timing.current, timing.base, seconds) : `| ${label} | Not measured | – | Report only |`);
}
console.log("\nTimings: median of 3 fresh Pixel 7 browser contexts per mode and build, 4× CPU slowdown; cold: 1.6 Mbps down, 150 ms latency. Compressed (gzip) Vite production preview, not a physical phone or the deployed edge. Cold service workers are blocked so every download is network-throttled. Offline uses a separate context with the normal service worker, a cached reload and a different lookup. A lookup completes when its result cards are visible.\n\n<details>\n<summary>Startup size guards</summary>\n\n| Check | This PR | Change | Limit |\n|---|---|---|---|");
for (const check of checks.filter((check) => check.limit)) {
  const paths = typeof check.path === "string" ? [check.path] : check.path;
  const current = await measure(".", [...new Set(await Array.fromAsync(glob(paths, { cwd: "." })))]);
  const base = await measure(baseDir, [...new Set(await Array.fromAsync(glob(paths, { cwd: baseDir })))]);
  console.log(row(check.name, current, base, kB, check.limit));
}
console.log("\nEnforced by `check:size`. Application assets count each shipped file once, including optional features and the service worker; dictionary files are separate.\n\n</details>");
