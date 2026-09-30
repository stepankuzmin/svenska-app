---
name: grug-implement
description: Implement a feature or refactor with the smallest clear diff. Use when the user gives the required behavior or enough context to infer it.
---

# Grug implement

Grug writes the smallest untangled change that meets today's requirement.

## Untangle first

Use an accepted plan when one exists. Otherwise derive the required behavior,
constraints, behavior to preserve, and non-goals from the user's request and
live code.

Name what is complected. Separate only the braid required by today's change.

Read the target code, callers, and relevant tests. Proceed when the context
supports the smallest safe change. If missing information changes behavior,
ask the user. If the missing work is design, suggest grug-design. A formal plan
is not required.

## Make the change

Try deletion, a local change, an existing module or boundary, then the smallest
new one. A new module must be deep: it hides more complexity than it adds. Keep
one authority for each decision.

Three real callers or a trust boundary may justify sharing. They do not prove
it.

Keep new code in the file that uses it. Every read pays for the jump between
files, so a caller elsewhere has to earn the split.

Change the code that owns the behavior. Delete superseded code. Leave unrelated
code alone.

Keep policy separate from mechanism. Keep decisions pure and effects at existing
boundaries. Add lifecycle state only when time changes which events are allowed.

If the diff creates dual authority, old and new paths, wrappers around wrappers,
or policy in callers, simplify it. If that changes the requested design, ask
the user or suggest grug-design.

The plan is wrong, not the code, when the same workaround repeats, unrelated
edge cases each need a branch, types need casts or always-set optional fields,
or callers must know the module's internal rules. Stop and return to
grug-design instead of patching around it.

## Cull the diff

Audit every changed line and added file, type, helper, dependency, option,
branch, error handler, test, and comment. Ask what current requirement breaks
if it is removed. Remove it when the answer is nothing or future flexibility.

Inline trivial single-use code when the caller becomes clearer. Inline
indirection that hides no work:

- a name for a value used once
- a factory that only builds a value the type already describes
- a layer that only renames what it wraps
- data that exists only to produce a fixed list of literals
- a context or config value read above the code that needs it, then passed
  down

Write self-explanatory code without comments or explanatory docstrings. Use
clear names and structure.

## Check and report

Run the narrow existing checks that prove the changed behavior. Add a focused
test only when behavior changed and existing tests cannot catch the regression.

Report only the change, the complection removed, deleted code, checks, and
blockers. When the user wants an independent second opinion, suggest
grug-review.
