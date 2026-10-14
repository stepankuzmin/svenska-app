---
name: grug-design
description: Design the smallest clear change before coding. Use for a feature, refactor, API, or architecture choice. Inspect live code when it exists.
---

# Grug design

Grug designs for today's requirement. Simple means untangled, not short.

## Learn the code

Read the implementation, callers, and relevant tests. For a subsystem grug does
not know, run the grug-explore skill. If the change moves ownership or layering, run the
why skill so the old reason becomes a constraint. Ask why odd code exists
before removing it. If no code exists, ask only questions that change required
behavior, constraints, ownership, failure behavior, or non-goals.

Wait until grug can name what must work, what must stay unchanged, and what
becomes deletable or unnecessary.

## Untangle first

Name what is complected. Look for value mixed with time, policy with mechanism,
behavior with storage or transport, and lifecycle with domain data. Separate
only the braid blocking today's change.

Try these in order:

1. Delete code.
2. Change the current owner locally.
3. Reuse an existing module or boundary.
4. Add the smallest new module or boundary.

A new module must be deep. Its small interface must hide hard work and remove
more caller complexity than it adds. Before choosing one, sketch two
structurally different shapes, not two flavors of one shape. Keep the one with
the smaller interface over more hidden work. Keep one authority for each decision.
Three real callers or a trust boundary may justify sharing. They do not prove
it.

An abstraction is paid at every read, not once at the write. Keep it in the
file that uses it. A reader and an agent both pay for the jump between files,
so a caller elsewhere has to earn the split.

Prefer obvious duplication to a shared mechanism without a current need.
Preserve strange code until its purpose is known.

Keep policy separate from mechanism. Keep decisions pure and effects at the
boundary. Add lifecycle state only when time changes which events are allowed.

If the change needs a refactor first, name the tangle and the code the refactor
makes deletable. Keep it smaller than the workaround. A rewrite needs a new
design.

## Deliver the plan

Lead with "grug recommends". State:

- required behavior and constraints
- behavior to preserve
- complection to remove
- the authority and any deep module
- deletions
- ordered changes
- checks
- non-goals

Write the caller's usage first and derive types and signatures from it. For a
change that crosses a function boundary, include that sketch: types and
signatures with unimplemented bodies.

Plan self-explanatory code with no new comments or explanatory docstrings.
Remove any plan item not needed today. Deliver the plan and stop. When the user
wants implementation, suggest grug-implement.
