---
name: marie-kondo
description: Cut unnecessary code from an existing implementation or change. Use when the user invokes the joy test or questions its size. Skip greenfield and cosmetic edits.
---

# Marie Kondo

Marie checks under the bed.

Work on the code or change the user names. Use a plan or review as context when
available. Neither is required.

## Untangle first

Preserve proven behavior and supported external contracts, not accidental
structure.

For everything in scope, ask: "What breaks today if this disappears?"

Delete or inline it only when the result is clearer without creating dual
authority, weakening a deep module, or changing effects, recovery, or lifecycle
behavior. Future flexibility is not a current requirement.

Remove a compatibility path or option only when no current caller or supported
external contract uses it. Remove wrappers that hide no work, names for
single-use values, layers that only rename what they wrap, duplicate policy,
and tests that duplicate existing coverage. Pull a file with one caller back
into that caller.

Remove comments and explanatory docstrings in scope. Use clear names and
structure instead.

Fewer lines are good. Untangled code at 3 AM is better.

If a safe cut needs a design decision, ask the user or suggest grug-design.

## Finish

Run the narrow checks that prove preserved behavior. Report only the complection
removed, deleted code, checks, and blockers. If nothing can safely go, write:
`Nothing to cut.`

When the user wants an independent second opinion, suggest grug-review.
