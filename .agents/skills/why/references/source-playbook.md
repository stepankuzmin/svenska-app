# Source playbooks

The why skill spawns one investigator per available evidence category, each reading the one playbook below that matches its category.

| Category | Playbook | Covers |
|---|---|---|
| Source control history | [`code-archaeology.md`](./sources/code-archaeology.md) | git, `gh` |
| Issue / ticket tracker | [`issues.md`](./sources/issues.md) | GitHub Issues through `gh` (adapt for a Linear or Jira MCP) |
| Long-form documents | [`docs.md`](./sources/docs.md) | Google Drive (adapt for Confluence or Notion) |
| Real-time team chat | [`slack.md`](./sources/slack.md) | Slack |

Cross-cutting:

- [`incident-postmortem.md`](./sources/incident-postmortem.md). Add this if the target code looks defensive (null checks, retry, timeout, rate limit, feature flag, egress guard, OOM handler).
