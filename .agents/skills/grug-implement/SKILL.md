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

## Check and report

Run the narrow existing checks that prove the changed behavior. Add a focused
test only when behavior changed and existing tests cannot catch the regression.

Prove claims by running code. The working tree includes the user's
unreviewed work, so change it only with edits you can undo one at a time:
break one line, run the test, then undo that edit. To run another version,
read it with `git show <rev>:<path>` or check it out with `git worktree add`
in a scratch directory and remove it after. Never run `git checkout`,
`restore`, `reset`, `stash`, or `clean` on the working tree, and never commit.

When the checks pass, run the grug-cleanup skill on the change.

Open with one sentence, alone in its paragraph: the change and the check
result. Then give cleanup's report without its opening sentence, and any
blockers. When the user wants an independent second opinion, suggest
grug-review.
