// Changed-line coverage: the share of executable lines this change added to
// unit-tested modules that the Vitest run executed. Reads coverage/lcov.info
// from the preceding `vitest run --coverage`; it never reruns the suite.
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { readDiff } from "./diff.ts";

// Why 80: high enough to force a test for new logic, low enough to allow a guard clause.
const MIN_CHANGED_LINE_COVERAGE = 80;

// React components, hooks and the entry point are exercised by the browser suite, not Vitest.
const unitScope = /^(src|scripts)\/[^/]+\.ts$/;
const outOfUnitScope = /^src\/(use-[^/]+|vite-env\.d)\.ts$/;

const lcovPath = "coverage/lcov.info";
if (!existsSync(lcovPath)) {
  console.error(`changed-coverage: ${lcovPath} is missing; run \`vitest run --coverage\` first`);
  process.exit(2);
}

// file -> line -> hit count, for every executable line v8 reported.
const hits = new Map<string, Map<number, number>>();
let current: Map<number, number> | undefined;
for (const record of readFileSync(lcovPath, "utf8").split("\n")) {
  if (record.startsWith("SF:")) {
    current = new Map();
    hits.set(relative(process.cwd(), resolve(record.slice(3))), current);
  } else if (record.startsWith("DA:") && current) {
    const [line, count] = record.slice(3).split(",").map(Number);
    current.set(line, count);
  }
}

let executable = 0;
let covered = 0;
const uncovered = new Map<string, number[]>();
for (const { file, line, text } of readDiff().added) {
  if (!unitScope.test(file) || outOfUnitScope.test(file)) continue;
  const fileHits = hits.get(file);
  // A module no test imports has no lcov record; count its non-blank lines as uncovered.
  const count = fileHits ? fileHits.get(line) : text.trim() ? 0 : undefined;
  if (count === undefined) continue;
  executable++;
  if (count > 0) covered++;
  else uncovered.set(file, [...(uncovered.get(file) ?? []), line]);
}

if (executable === 0) {
  console.log("changed-coverage: no executable lines changed in unit-tested modules");
  process.exit(0);
}

const percent = (covered / executable) * 100;
const summary = `changed-coverage: ${covered}/${executable} changed lines covered (${percent.toFixed(1)}%, minimum ${MIN_CHANGED_LINE_COVERAGE}%)`;
if (percent >= MIN_CHANGED_LINE_COVERAGE) {
  console.log(summary);
  process.exit(0);
}
console.error(summary);
for (const [file, lines] of uncovered) console.error(`  ${file}: ${lines.join(", ")}`);
process.exit(1);
