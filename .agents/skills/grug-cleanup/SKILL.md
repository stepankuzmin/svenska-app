---
name: grug-cleanup
description: Prepare the current changes for human review with the smallest clear diff. Cuts code that earns nothing, strips comments to the essential ones, unslops the remaining text, and rates confidence in the result. Use when the work is done and about to go to review, or when the user asks to clean up, polish, give a final pass, run the joy test, or questions the size of a change.
---

# Grug cleanup

Grug makes the change a joy to review. The reviewer reads every line, so every
line left must earn the read. Cleanup preserves behavior. It never adds a
feature or changes what the code does.

## Find the work chunk

The chunk is everything the branch changes: commits since it left the default
branch, uncommitted edits, and untracked files.

```bash
git diff --no-ext-diff "$(git merge-base HEAD main)"
git status --short
```

Use the branch's real default if it is not `main`. When the user names files or
a pull request, clean those instead.

Read the request, plan, or review behind the change when available, and state
its intent in one sentence. If you cannot, ask.

## Cut what earns nothing

For every changed line and every added file, type, helper, dependency, option,
branch, error handler, and test, ask what breaks today if it disappears. Delete
it when the answer is nothing or future flexibility.

Inline indirection that hides no work:

- a name for a value used once
- a wrapper or layer that only renames what it wraps
- a factory that only builds a value the type already describes
- data that exists only to produce a fixed list of literals
- a context or config value read above the code that needs it, then passed
  down
- a file with one caller
- a test that duplicates existing coverage

Remove a compatibility path or option only when no current caller or supported
external contract uses it. Do not cut when the result creates dual authority,
weakens a deep module, or changes effects, recovery, or lifecycle behavior.

Stay inside the chunk. If a safe cut needs a design decision, ask the user or
suggest grug-design.

## Strip comments

Delete every comment and docstring the chunk adds or rewrites, including
commented-out code and notes about later work. Keep only these:

- legal headers
- public API contracts
- issue or RFC links
- behavior forced by a dependency we cannot change

A comment that explains our own surprising code means the code should change.
Rename or restructure until the code reads without it. A comment saying "do not
remove" or "important" makes a claim. Check it with grug-explore, the why
skill, or by running code. When the claim holds, enforce it with a type,
test, or lint and delete the comment. Keep the comment only when nothing can
enforce it.

## Unslop the text

Run the unslop skill on every piece of prose the chunk still adds or changes:
surviving comments, docs, user-facing strings, and error messages. When a test
or caller matches a string exactly, change both together.

## Check

Prove claims by running code. The working tree includes the user's
unreviewed work, so change it only with edits you can undo one at a time:
break one line, run the test, then undo that edit. To run another version,
read it with `git show <rev>:<path>` or check it out with `git worktree add`
in a scratch directory and remove it after. Never run `git checkout`,
`restore`, `reset`, `stash`, or `clean` on the working tree, and never commit.

Run the narrow existing checks that prove behavior is unchanged. When a check
fails, undo the cut that broke it instead of patching around it.

## Rate confidence

Reread the final chunk diff as the reviewer will. For each hunk, ask whether it
is correct, needed today, and the simplest version. Write each doubt with its
file and line.

Fix every doubt that needs no design decision, run the checks again, and
reread the diff. Repeat until each remaining doubt needs the user or a design
choice.

Rate from 0 to 100 your confidence that the chunk is correct and as simple as
it can be. Score from the doubts, not from the effort spent.

Below 80, list the doubts as questions for the user, and suggest grug-design
when one needs a design choice.

## Report

Delete every leftover this session's checks and experiments created: test and
build caches, compiled files, temp copies, and scratch worktrees. Compare
`git status --short` and `git worktree list` with the status before this
session's first edit or check, and delete only what this session added.

Open with one sentence: the branch, the diff size before and after, and the
check result, such as "Cleaned `rate-limit`: 106 added lines down to 66, tests
pass." Do not restate the intent or say that nothing is committed.

Then report only the complection removed, deleted code, comments removed, text
rewritten, the confidence score, and the doubts behind it, one line each. If
nothing can safely change, write `Nothing to clean.` and the score.
