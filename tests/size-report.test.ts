import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { brotliCompressSync } from "node:zlib";
import { afterEach, expect, test } from "vitest";

const scratch: string[] = [];
afterEach(() => { for (const path of scratch.splice(0)) rmSync(path, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "size-report-"));
  scratch.push(root);
  for (const dir of ["head", "base"]) {
    mkdirSync(join(root, dir, "dist/assets"), { recursive: true });
    writeFileSync(join(root, dir, "dist/assets/index-123.js"), "hello app");
    writeFileSync(join(root, dir, "dist/lexin-dictionary.123.json"), "lookup");
    writeFileSync(join(root, dir, "dist/lexin-details.123.json"), "details");
    writeFileSync(join(root, dir, "dist/sw.js"), "worker");
  }
  writeFileSync(join(root, "head/.size-limit.json"), JSON.stringify([
    { name: "App JS", path: ["dist/assets/*.js", "dist/assets/index-*.js"], limit: "65 kB" },
  ]));
  return root;
}
function report(root: string, timing?: string) {
  return execFileSync(resolve("node_modules/.bin/tsx"), [
    resolve("scripts/constraints/size-report.ts"), join(root, "base"), ...(timing ? [timing] : []),
  ], { cwd: join(root, "head"), encoding: "utf8", stdio: "pipe" });
}
const size = (...contents: string[]) => `${(contents.reduce((sum, content) => sum + brotliCompressSync(content).length, 0) / 1000).toFixed(2)} kB`;

test("groups shipped assets and dictionaries without double counting overlapping guards", () => {
  const result = report(fixture());
  expect(result).toContain(`| Application assets (brotli) | ${size("hello app", "worker")} |`);
  expect(result).toContain(`| Dictionary downloads (brotli) | ${size("lookup", "details")} |`);
  expect(result).toContain(`| App JS | ${size("hello app")} | 0.00 kB | 65 kB |`);
  expect(result).toContain("<summary>Startup size guards</summary>");
  expect(result).toContain("Not measured");
});

test("reports mobile medians and signed changes without inventing a time budget", () => {
  const root = fixture();
  const timing = join(root, "mobile.json");
  writeFileSync(timing, JSON.stringify({ cold: { current: 2100, base: 2000 }, offline: { current: 200, base: 300 } }));
  const result = report(root, timing);
  expect(result).toContain("| Cold mobile lookup | 2.10 s | +0.10 s | Report only |");
  expect(result).toContain("| Cached offline lookup | 0.20 s | -0.10 s | Report only |");
});

test("rejects invalid measurements instead of reporting false results", () => {
  const root = fixture();
  const timing = join(root, "mobile.json");
  writeFileSync(timing, '{"cold":{"current":-1,"base":0}}');
  expect(() => report(root, timing)).toThrow();
});
