---
name: grug-explore
description: Build a working understanding of how part of a codebase works before designing, changing, or reviewing it. Use for "explore X", "get context on X", or when grug must learn unfamiliar code first.
argument-hint: <topic>
model: opus
allowed-tools: Read Grep Glob LSP Bash(rg *) Bash(fzf *) Bash(git log *) Bash(git show *) Bash(git blame *)
---

# Grug explore

Grug learns how $ARGUMENTS works before touching it. The goal is context in
grug's head that later work can trust, not a document for the user. Only read.
Do not edit files.

## Map the ground

Start wide. Code the topic depends on often sits where its name never appears:
config, constants, tests, build scripts, migrations, generated types. Look
there too.

- List source files with `rg --files --hidden -g '!.git'`. It respects
  `.gitignore`, so build output and dependencies stay out, and it keeps
  dot-directories such as `.github`. Add `-g '!<glob>'` for anything else.
- Fuzzy-match paths against topic words by piping that list into
  `fzf --filter '<word>'`. Try synonyms and abbreviations.
- Search content with `rg -n`. Narrow with `-t <lang>` and `-g <glob>`. Use
  `-w` for identifiers and `-F` for literal strings.

Run independent searches in one message, in parallel.

## Find the entry points

Find where control enters the topic: exported functions, routes, CLI
commands, event handlers, jobs, the public types. Prefer an LSP tool when one
is available for the language: `workspaceSymbol` to find a definition,
`documentSymbol` to outline a file. When no LSP serves the language, search
definition patterns with `rg`, for example
`rg -n '^\s*(export\s+)?(async\s+)?(function|class|interface|type|const)\s+Name\b'`
for TypeScript or `rg -n '^\s*(pub\s+)?(fn|struct|enum|trait|impl)\b.*Name'`
for Rust.

## Trace the connections

Read each entry point with enough surrounding code to see what it takes, what
it returns, and what it changes. Then follow the links both ways:

- Outward: what it calls and imports. With an LSP tool, use `goToDefinition`,
  `goToImplementation`, and `outgoingCalls`. They resolve re-exports, aliases,
  overloads, and interface implementations that text search misses.
- Inward: who calls it. Use `findReferences` and `incomingCalls`. Fall back to
  `rg -nw Name` when no LSP serves the language, and check each hit, since text
  matches include unrelated names and comments.
- Types: use `hover` to read an inferred type instead of reconstructing it.

Use `rg` over LSP for strings, config keys, SQL, file paths, and names that
cross a language boundary.

Read tests that exercise the topic. They show intended behavior and the edge
cases someone cared about. When code looks odd, check its history with
`git log -L <start>,<end>:<file>` or `git blame` before assuming it is wrong.

For an unfamiliar library, read its installed source or type definitions first
(`node_modules/<pkg>`, `~/.cargo/registry/src`, the virtualenv), because that
is the version this code runs. Search the web only when the installed source
leaves the question open.

## Know when to stop

Keep tracing until grug can answer all of these from code grug has read:

- Where does control enter, and what triggers it?
- What data flows through, in what shape, and where does it change?
- Which module owns each decision, and where does state live?
- What does it call outside itself, and what calls it?
- Which tests pin its behavior?

When a question stays open, return to "Map the ground" with the names, types,
and terms learned so far, and repeat.

Stop early only when an answer depends on something grug cannot read, such as
a running service or a private dependency, and name that gap. Do not stop
because the search count feels high, and do not stop after the first plausible
path when callers or implementations remain unchecked.

## Report

Organize by how the pieces relate, not by discovery order. Keep each section
short and cite `path:line` for every claim.

- Entry points and triggers
- Flow: the path from input to effect, one step per line
- Owners of decisions and state
- Tests that cover it
- Gaps: questions the code could not answer

Quote code only where the exact lines matter. Finish with the report. When the
user wants a change, suggest grug-design or grug-implement.
