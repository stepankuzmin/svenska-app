---
name: why
description: "Use when the user asks to investigate why code is built the way it is: 'why does X work this way', 'why we picked Y', design rationale, regressions, or postmortems. Not for explaining a single error or a quick question. Queries each available evidence source (git and PRs, issues, docs, team chat) in parallel, then returns a cited read on decisions and tradeoffs. Use how for runtime behavior."
---

# Why

Investigate the motivation and intent behind code.

Companion to the `how` skill. `how` answers what the code does and how it works. `why` answers what forces led to its shape.

## Operating Posture

Operate as a **careful, cautious, and precise investigator**. Be honest about what you know vs what you're inferring. Read `references/epistemics.md` for the full confidence framework and phrasing guide. The synthesizer must follow it.

## Step 1. Understand the Target and the Question

Parse what the user is asking. The **target** is usually a chunk of code, a pattern, a feature, or a named design decision. The **question** is usually a design rationale, a tradeoff, a motivating edge case, an external constraint, dead code, or a broad history sweep.

If the target is vague ("why do we do it this way?" with no clear referent), make your best guess from conversation context (open files, recent edits, what was just discussed). State your interpretation briefly so the user can redirect if you're off, then proceed.

## Step 2. Establish the Code Anchor

Before spawning investigators, anchor the investigation in concrete code. You need:

- The relevant file path(s) and line range(s)
- The key symbols (function names, class names, constants)
- An initial commit list. The last few commits touching the target.
- PR numbers from merge commits (pattern `(#1234)` in the subject line)

Build this inline.

```bash
# Blame target lines for last-touch commits
git blame -L <start>,<end> <file>

# Full file history, with patches, through renames
git log --follow -p -- <file>

# Last N commits touching the file, PR numbers visible
git log --oneline -20 -- <file>

# Extract PR numbers from a commit message
git log -1 --format=%B <commit>
```

Pull PR bodies and discussion via `gh` for any substantive commits:

```bash
gh pr view <number> --json title,body,author,createdAt,mergedAt,labels,closingIssuesReferences,comments,reviews
```

Capture this as seed context (file paths, symbols, commits, PR numbers, linked ticket IDs). Pass it to the investigators.

## Step 3. Spawn Parallel Investigators (default posture)

**Default to the full parallel investigation.**

### Discovery

List the MCP servers and tools available in this session. Map each to one evidence category:

1. Source control history
2. Issue / ticket tracker
3. Long-form documents
4. Real-time team chat

Source control is always available through git and `gh`, and GitHub Issues through `gh`. For the others, classify using the MCP name, server instructions, and tool names. If an MCP could fit more than one category, choose the one matching its primary evidence. Record ambiguous cases in the coverage map.

An MCP outside these categories that holds evidence about the target, such as error tracking or observability, gets its own investigator with the base prompt and no playbook.

Aim for a complete **coverage map**, not a minimal one. Document the null, don't skip the search.

Launch all matching investigators in a single message so they run concurrently. Don't ask one agent to cover multiple sources. Investigators need MCP access, so don't use a read-only agent type that strips it. Tell them not to write anything.

Each investigator gets:
1. The base prompt from `references/investigator-prompt.md`
2. The category playbook `references/sources/<source>.md`, adapted to the available MCP (index in `references/source-playbook.md`)
3. The cross-cutting `references/sources/incident-postmortem.md` **if the target code looks defensive** (null checks, retry logic, timeout handling, rate limiting, feature flags, egress guards, OOM handlers)
4. The code anchor from Step 2 (file paths, symbols, commit hashes, PR numbers, ticket IDs)
5. The user's original question

### Investigator roster. One per available evidence category

1. **Source control investigator**. Git history, `gh` for PRs, code comments, tests. Always spawn. Best at surfacing *implementation-time rationale captured during review*.

2. **Issue / ticket tracker investigator** (GitHub Issues through `gh`, or a Linear or Jira MCP). Best at surfacing *the product or business forcing function*. Strongest when the why is external to engineering.

3. **Long-form documents investigator** (e.g. Google Drive, Confluence, Notion MCP). Best at surfacing *long-form design rationale*, written out before it becomes code.

4. **Real-time team chat investigator** (e.g. Slack MCP). Best at surfacing *real-time deliberation that never reached a doc*. Especially important when the source control, ticket, and doc paper trail is thin.

### When to skip an investigator

Only skip with an **explicit, written justification** that goes in the final "Sources Consulted" section. Two valid reasons:

- **No MCP is available for that category** in this session. Flag this as a gap, not a choice. Example: "Real-time team chat skipped. No matching MCP available, so the conversational record was not searchable."
- **The source is provably irrelevant**, not just "probably irrelevant." A high bar.

If the target is a single-commit change whose PR description already contains the complete answer, you may answer inline **only after** confirming every other category search would be redundant. Say so explicitly. This should be rare.

## Step 4. Synthesize

Spawn one synthesizer subagent with MCP access. Its quality check spot-verifies citations, which can require MCP calls. It does not write anything.

The synthesizer gets:
1. The investigator findings, including any null results and any categories skipped with justification
2. The code anchor from Step 2 (file paths, symbols, commit hashes, PR numbers, ticket IDs)
3. The user's original question
4. The epistemics framework from `references/epistemics.md`
5. The synthesizer prompt template from `references/synthesizer-prompt.md`

## Step 5. Present

Take the synthesizer's output and present it to the user. You may lightly edit for clarity or add context from the conversation, but **do not rewrite the confidence language**.

## Output Format

The output structure is the one in `references/synthesizer-prompt.md`: The Question, The Code in Question, What We Found, What We Can Reasonably Infer, Competing Hypotheses, What We Don't Know, Sources Consulted, Confidence Summary. Adapt as needed, but keep the confidence separation intact, and keep Sources Consulted as one line per investigator, including the ones that returned nothing or were skipped, with the reason.

After the Sources Consulted block, if the user's `why` question is a precursor to actually changing this code, convert the lineage findings into a Preserve / Change / Avoid / Risk constraint set suitable for planning the change.

## Common Failure Modes to Avoid

- **Recency bias**. Assuming the most recent commit is authoritative. The current shape is often the accretion of many earlier decisions. Trace back.

## Reference Files

- `references/epistemics.md`. Confidence tiers and phrasing guide. The synthesizer must follow it.
- `references/investigator-prompt.md`. Base prompt template for investigator subagents.
- `references/source-playbook.md`. Index pointing at the category playbooks below.
- `references/sources/*.md`. One playbook per category, plus cross-cutting `incident-postmortem.md`. Give an investigator the single file that matches its category.
- `references/synthesizer-prompt.md`. Prompt template for the synthesizer subagent, including the output format.
