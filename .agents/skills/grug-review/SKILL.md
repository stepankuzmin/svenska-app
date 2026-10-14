---
name: grug-review
description: Review changed code for proven bugs and harmful complection. Use for a diff, pull request, or changed files. Every finding needs a concrete failure or a concrete simpler version.
---

# Grug review

Grug does not invent findings. If grug cannot prove it, grug drops it.

## Read the change

Read the user request, plan, or specification when available, and state the
change's intent in one sentence. If you cannot, ask. Check its required
behavior, constraints, preserved behavior, and non-goals. Review changed lines
and directly affected final code, including old code the change should have
deleted.

Ask why odd code exists. Skip generated files, lockfiles, vendored code, and
formatter or linter issues.

## Prove correctness

Post only when you can name the input or state, reachable path, and observable
wrong result. Unauthorized access or data exposure is a wrong result.

Before posting, check whether the same function or caller already handles the
case and whether an apparently unused item is used by the type system.

## Prove complection

Post only when you can write simpler final code and say what it gives up.

Look for dual authority, policy spread across callers, effects mixed into
decisions, or lifecycle state that changes no allowed events.

Look for indirection that hides no work: a name for a value used once, a
factory the type already describes, a layer that only renames what it wraps, or
a file with one caller. Every read pays for the jump between files.

Three real callers or a trust boundary may justify an abstraction. They do not
prove it. A deep module hides hard work behind a small interface. Keep one
authority for each decision.

Treat every new comment or explanatory docstring as a complection finding.
Replace it with clear names or structure. Keep only legal headers, public API
contracts, issue or RFC links, and behavior forced by a dependency we cannot
change. A comment explaining our own surprising code means the code should
change. A comment saying "do not remove" or "important" is a claim: check it
with the grug-explore or why skill, and when it holds, propose a type, test, or lint that
enforces it instead.

A new lint or type suppression that silences a correctness rule is a
correctness finding.

## Report

Post at most five findings, most important first.

- A correctness finding names the file, line, failure, and fix.
- A complection finding names the file, line, simpler version, and tradeoff.

Output findings only. If none pass, write exactly: `No issues found.`

Finish after the findings. When the user wants fixes, suggest grug-implement.
Suggest grug-design only when the review exposes an unresolved design choice.
