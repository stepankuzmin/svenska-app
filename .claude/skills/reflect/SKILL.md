---
name: reflect
description: Spawn three parallel review subagents over the active transcript, surface learnings, and route each to a concrete edit on an existing skill. Use when the user says reflect.
---

# Reflect

Mine the current conversation for durable learnings, then route them into skill edits.

## When to invoke

Invoke when the user says "reflect" or "/reflect". Skip when the conversation is trivial, off-topic, or already covered by an existing skill the parent followed correctly. One-offs are not learnings.

## Process

### 1. Locate the active transcript

The parent finds its own transcript file before fanning out. Claude Code keeps each session at `${CLAUDE_CONFIG_DIR:-~/.claude}/projects/<slug>/<session-id>.jsonl`, where `<slug>` is the workspace path with every `/` turned into `-` (so `/Users/you/proj` becomes `-Users-you-proj`), and its subagents under `<session-id>/subagents/`. Codex keeps sessions at `~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-*.jsonl`. Every line is one event. Look only in the current workspace's directory. Globbing across projects reads private chats from unrelated projects.

```bash
ls -t "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects/<slug>"/*.jsonl | head -5
```

The newest file is usually the active session. Confirm by grepping it for the conversation's opening user prompt. If no path resolves, write a tight digest of the session and pass that instead.

### 2. Spawn three reviewers in parallel

One message, three subagents. Reviewers need MCP access for context lookups (tickets and chat threads referenced in the transcript), so don't use a read-only agent type that strips it. If another model family is available, give it the tooling lens.

| Lens | Prompt template |
|---|---|
| Judgment | `references/judgment-reviewer.md` |
| Tooling | `references/tooling-reviewer.md` |
| Divergent | `references/divergent-reviewer.md` |

Pass each template verbatim, substituting the transcript path or digest where marked. Reviewers return findings in their final message.

### 3. Synthesize

One subagent with MCP access, since its quality check spot-verifies citations. Use `references/synthesizer.md` verbatim, with each reviewer's full output inlined where marked. The synthesizer returns a structured Accepted / Rejected / Backlog list.

### 4. Structural enforcement check

Sanity-check the synthesizer's Accepted list. For any item that would be enforced more reliably by a lint rule, script, metadata flag, or runtime check, move it from Accepted to Backlog. See the **principle-encode-lessons-in-structure** skill.

### 5. Apply

Before applying any Accepted edit, present the synthesizer's full Accepted/Rejected/Backlog output to the user and wait for explicit approval. The user picks which subset to apply and may redirect routings. Skill changes affect every future agent. Do not auto-apply.

List Backlog items in the reply. File them to a tracker only if the user asks.

For each approved Accepted item, follow the Routing field exactly:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): parent does directly.
- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): hand to the `skill-creator` skill and run its draft / test / iterate loop.
- `tune description: <skill path>` (the skill exists but didn't trigger when it should have): hand to `skill-creator` and run its description-optimization loop.
- `new skill: <kebab-name>`: hand creation to `skill-creator`. Do not invent the shape ad hoc.

If your environment ships a SKILL.md validator, run it on every touched skill before declaring done. Skip this step if it doesn't.

### 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog: one line each.
- Dropped: one line per rejected finding + reason from the synthesizer.
