# Constraints

This file sets the checks every change in this repository must pass. A failing check blocks the work. The agent fixes the code before handing work back, and CI blocks the deploy. Anyone may tighten a number. Loosening one needs a human's approval, and the floor guard reports it as a violation.

Last reviewed: 2026-09-24 by @stepankuzmin

## Floor

`npm run check:floor` (`scripts/constraints/floor-guard.ts`) enforces these rules on the diff against the merge base with `origin/main`.

- No new suppression comments: `@ts-ignore`, `@ts-nocheck`, `@ts-expect-error`, `eslint-disable`, `oxlint-disable`, `istanbul ignore`, `v8 ignore`
- No unfinished work: `throw new Error("not implemented")`, an empty `catch {}`, a new `TODO` or `FIXME`
- No test made easier: no `.skip`, `.only`, `.todo` or `.fixme`, no deleted test file, no assertion removed from a test that stays
- No threshold loosened: Vitest coverage thresholds, the changed-line minimum, `.size-limit.json` budgets, `error` rules in `.oxlintrc.json`, and `--deny-warnings` on `npm run lint`
- No line removed from this Floor section
- Nobody weakens this file to make a change pass

## Enforced with numbers

| Dimension | Rule | Why this number | Checked by | Runs at |
|-----------|------|-----------------|------------|---------|
| Types | Zero type errors | Strict mode is already clean | `npm run typecheck` | edit loop (`check:fast`), CI |
| Lint | Zero oxlint errors or warnings | The existing `--deny-warnings` bar | `npm run lint` | edit loop (`check:fast`), CI |
| Floor | Zero floor violations | See above | `npm run check:floor` | edit loop (`check:fast`), CI |
| Coverage: changed lines | ≥ 80% of executable lines added to `src/*.ts` and `scripts/*.ts` run by Vitest | High enough to force a test for new logic, low enough to allow a guard clause. Applies to new code only, so no legacy debt blocks it | `npm run check:coverage` (reads `coverage/lcov.info` and intersects it with `git diff`) | task end (`check:task`), CI |
| Coverage: project | Lines ≥ 44.9%, statements ≥ 44.4%, branches ≥ 41.7%, functions ≥ 37.6% | Today's values less 0.5 points, so a change to an unrelated file doesn't fail the build. The thresholds only move up | `vitest run --coverage` (thresholds in `vitest.config.ts`) | task end, CI |
| Bundle: app JS | ≤ 84.46 kB brotli | 84.03 kB today plus 0.5%. The budget only moves down | `npm run check:size` (`.size-limit.json`) | task end, CI |
| Bundle: app CSS | ≤ 2.48 kB brotli | 2.38 kB today plus 100 B, because 0.5% of a file this small is 12 B | `npm run check:size` | task end, CI |
| Dictionary release: lookup file | ≤ 753.7 kB brotli | 749.9 kB today plus 0.5%. When a new source edition grows the file, the same PR raises this budget and states why | `npm run check:size` | task end, CI |
| Dictionary release: word-detail file | ≤ 708.7 kB brotli | 705.1 kB today plus 0.5%. Same rule as the lookup file | `npm run check:size` | task end, CI |
| Browser journey | Built app passes on Chromium, WebKit, Pixel 7 and iPhone 13 | Required by `AGENTS.md` for UI, mobile and PWA changes | `npm run test:browser` | task end for UI changes, CI |

The changed-line coverage rule skips React components, hooks (`src/use-*.ts`) and `src/main.tsx`. The browser suite tests them, not Vitest.

`npm run check:task` runs the edit-loop checks, coverage, the build and the size budgets in about 9.5 seconds. Its budget is 15 seconds, about 50% above today. Nothing times the run. `npm run check:full` adds the dictionary release check and the browser journey.

## Measured, not yet enforced

| Metric | Today (2026-09-24) | Direction |
|--------|--------------------|-----------|
| Project line coverage | 45.45% | must not fall, enforced by the project coverage thresholds above |
| Precache size | 9458 KiB uncompressed, 7 entries | must not grow without a new source edition |

## Exceptions

Each row waives floor-guard findings until its expiry date. A finding matches a row when it has the same rule and its location starts with the row's path. The guard reports new rows for human review and fails on expired ones.

An exception lasts at most 90 days. That is long enough to plan the fix and short enough to remember it.

The rules are `silenced-checker`, `unfinished-work`, `test-made-easier`, `test-deleted`, `assertion-removed`, `threshold-loosened`, `threshold-removed` and `floor-weakened`.

| ID | Rule | Path | Reason | Owner | Expires |
|----|------|------|--------|-------|---------|
