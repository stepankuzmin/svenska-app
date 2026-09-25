// Floor guard: flags the moves that lower the bar in CONSTRAINTS.md, scoped to
// the diff against the merge base. Exit 0 clean, 1 violation, 2 could not run.
// Adapted from the constraint-driven-development floor-guard reference.
import { existsSync, readFileSync } from "node:fs";
import { fileAtBase, readDiff } from "./diff.ts";

const suppression =
  /@ts-ignore|@ts-nocheck|@ts-expect-error|eslint-disable|oxlint-disable|biome-ignore|istanbul ignore|[cv]8 ignore/;
const unfinished = /throw new Error\(.*not implemented|catch\s*(\(\s*\w*\s*\))?\s*\{\s*\}|\bTODO\b|\bFIXME\b/i;
const easierTest = /\b(it|test|describe)\.(skip|only|todo|fixme)\b|\bx(it|describe)\(/;
const testFile = /\.(test|spec)\.tsx?$/;
const assertion = /\b(expect|assert)\b/;
const exceptionRow = /^\|\s*E\d+\s*\|/;
const coverageThreshold = /\b(lines|statements|branches|functions):\s*([\d.]+)/g;
const changedLineMinimum = /MIN_CHANGED_LINE_COVERAGE = ([\d.]+)/;
const sizeLimit = /^([\d.]+)\s*(B|kB|KB|KiB|MB|MiB)$/;
const markdown = /\.md$/;
const unitBytes: Record<string, number> = { B: 1, kB: 1000, KB: 1000, KiB: 1024, MB: 1e6, MiB: 1024 ** 2 };

const { mergeBase, added, removed, deletedFiles } = readDiff();
type Finding = { rule: string; where: string; detail: string };
const findings: Finding[] = [];
const flag = (rule: string, where: string, detail: string) =>
  findings.push({ rule, where, detail: detail.trim().slice(0, 120) });

const current = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null);

// Silenced checkers, unfinished work and easier tests in added lines.
// Markdown and this file name the patterns without using them.
for (const { file, line, text } of added) {
  if (markdown.test(file) || file === "scripts/constraints/floor-guard.ts") continue;
  const where = `${file}:${line}`;
  if (suppression.test(text)) flag("silenced-checker", where, text);
  if (unfinished.test(text)) flag("unfinished-work", where, text);
  if (easierTest.test(text)) flag("test-made-easier", where, text);
}

for (const file of deletedFiles) {
  if (testFile.test(file)) flag("test-deleted", file, "test file removed");
}
for (const { file, line, text } of removed) {
  if (testFile.test(file) && !deletedFiles.includes(file) && assertion.test(text)) {
    flag("assertion-removed", `${file}:${line}`, text);
  }
}

// CONSTRAINTS.md: any line removed from the Floor section.
const baseConstraints = fileAtBase(mergeBase, "CONSTRAINTS.md")?.split("\n") ?? [];
const floorStart = baseConstraints.findIndex((text) => text.startsWith("## Floor"));
const nextSection = baseConstraints.findIndex((text, index) => index > floorStart && text.startsWith("## "));
const floorEnd = nextSection === -1 ? baseConstraints.length : nextSection;
for (const { file, line, text } of removed) {
  // `line` is 1-based; the Floor heading sits at index floorStart.
  if (file === "CONSTRAINTS.md" && floorStart !== -1 && line > floorStart && line <= floorEnd && text.trim()) {
    flag("floor-weakened", `${file}:${line}`, text);
  }
}

// Numeric thresholds, compared with their values at the merge base.
function compare(path: string, read: (source: string) => Map<string, number>, looser: (was: number, now: number) => boolean) {
  const baseSource = fileAtBase(mergeBase, path);
  if (baseSource === null) return;
  const was = read(baseSource);
  const now = read(current(path) ?? "");
  for (const [name, value] of was) {
    const next = now.get(name);
    if (next === undefined) flag("threshold-removed", path, `${name} (was ${value})`);
    else if (looser(value, next)) flag("threshold-loosened", path, `${name}: ${value} -> ${next}`);
  }
}

compare(
  "vitest.config.ts",
  (source) => new Map(Array.from(source.matchAll(coverageThreshold), (match) => [match[1], Number(match[2])])),
  (was, now) => now < was,
);
compare(
  "scripts/constraints/changed-coverage.ts",
  (source) => {
    const match = changedLineMinimum.exec(source);
    return new Map(match ? [["MIN_CHANGED_LINE_COVERAGE", Number(match[1])]] : []);
  },
  (was, now) => now < was,
);
compare(
  ".size-limit.json",
  (source) => {
    const entries: { name: string; limit?: string }[] = source ? JSON.parse(source) : [];
    // An entry without a limit is only reported, so it counts as unlimited.
    return new Map(
      entries.map(({ name, limit }) => {
        const match = limit === undefined ? null : sizeLimit.exec(limit.trim());
        return [name, match ? Number(match[1]) * unitBytes[match[2]] : Number.POSITIVE_INFINITY];
      }),
    );
  },
  (was, now) => now > was,
);
compare(
  ".oxlintrc.json",
  (source) => {
    const rules: Record<string, unknown> = source ? (JSON.parse(source).rules ?? {}) : {};
    return new Map(Object.entries(rules).map(([rule, level]) => [rule, level === "error" ? 1 : 0]));
  },
  (was, now) => now < was,
);
compare(
  "package.json",
  (source) => {
    const lint: string = source ? (JSON.parse(source).scripts?.lint ?? "") : "";
    return new Map([["lint --deny-warnings", lint.includes("--deny-warnings") ? 1 : 0]]);
  },
  (was, now) => now < was,
);

// Exceptions: `| E1 | rule | path prefix | reason | owner | YYYY-MM-DD |`.
// A live row waives matching findings; an expired, malformed or over-90-day row is itself a violation.
// A row this change adds is reported for review rather than failing the run.
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const today = isoDate(new Date());
const latestExpiry = isoDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
const expiryDate = /^\d{4}-\d{2}-\d{2}$/;
const live = (expires: string) => expiryDate.test(expires) && expires >= today && expires <= latestExpiry;
const exceptions = (current("CONSTRAINTS.md") ?? "")
  .split("\n")
  .filter((text) => exceptionRow.test(text))
  .map((text) => text.split("|").map((cell) => cell.trim().replaceAll("`", "")))
  .map(([, id, rule, path, , , expires]) => ({ id, rule, path, expires }));
for (const { id, rule, expires } of exceptions) {
  if (!expiryDate.test(expires)) flag("exception-invalid", "CONSTRAINTS.md", `${id} ${rule} expiry ${expires} is not YYYY-MM-DD`);
  else if (expires < today) flag("exception-expired", "CONSTRAINTS.md", `${id} ${rule} expired ${expires}`);
  else if (expires > latestExpiry) flag("exception-too-long", "CONSTRAINTS.md", `${id} ${rule} expires ${expires}, after ${latestExpiry}`);
}
const waived = (finding: Finding) =>
  exceptions.some(
    ({ rule, path, expires }) => live(expires) && rule === finding.rule && finding.where.startsWith(path),
  );
const violations = findings.filter((finding) => !waived(finding));

for (const { file, line, text } of added) {
  if (file === "CONSTRAINTS.md" && exceptionRow.test(text)) {
    console.warn(`floor-guard: new exception needs human review: CONSTRAINTS.md:${line}: ${text.trim()}`);
  }
}

if (violations.length === 0) {
  console.log(`floor-guard: clean${findings.length ? ` (${findings.length} waived by exceptions)` : ""}`);
  process.exit(0);
}
console.error(`floor-guard: ${violations.length} floor violation(s):`);
for (const { rule, where, detail } of violations) console.error(`  [${rule}] ${where}: ${detail}`);
console.error("\nEach lowers the bar. Fix the code, or ask a human to approve an Exceptions row in CONSTRAINTS.md.");
process.exit(1);
