# Issues

## What this source contains

- Issues describing features, bugs, and their motivation
- Comments on issues (clarifications, scope changes, "why we're doing this" rationale)
- Labels (e.g., `compliance`, `customer-request`, `perf`) that signal the type of motivation
- Milestones and projects that tie work to a deadline or initiative
- Linked PRs and cross-referenced issues

The issue tracker is where the product/business context often lives: the "we're doing this because customer X asked" or "this is for the Q3 compliance initiative" layer.

## How to search it

GitHub Issues through `gh`. For a Linear or Jira MCP, map each step to its tools.

1. **Start with linked issues.** Fetch every issue the seed commits or PRs reference (`#123`, `Fixes #123`, `closingIssuesReferences`). Read the full issue including comments.

   ```bash
   gh issue view <number> --comments --json title,body,author,createdAt,closedAt,labels,milestone,comments
   ```

2. **Search by keyword.** Try the feature name, key symbol, error string, and business term, with several phrasings. Include closed issues.

   ```bash
   gh search issues '<query>' --repo <owner>/<repo> --state all --limit 50
   ```

3. **Follow the tree.** Tracking issues, task lists, and "part of #N" links lead from a tactical issue to the initiative that carries the "why."
4. **Check labels and milestones.** Labels hint at the category of motivation (customer-request, incident-followup, compliance). Milestones tie work to deadlines, which often reveal motivation.

## What good evidence looks like here

- An issue description stating the business problem: "Customer Acme needs X because of their SOC2 audit"
- A comment recording a decision: "We decided to go with approach B because approach A would require touching the billing service"
- A tracking issue titled like an initiative: "Enterprise readiness" or "Reduce payment failures"
- Labels like `customer:acme`, `incident-followup`, `compliance`, `perf-regression`

## Common pitfalls

- **Scope drift.** The issue may have been closed and reopened with a different scope. Read the whole history.
- **Mechanical templates.** Some teams require "Why" sections but fill them with boilerplate. Generic text ("improve user experience") is probably not a real answer.
- **Stale issues.** Old issues often reflect a version of the plan that changed. Check dates and cross-reference with the code's ship date.
- **Duplicate chains.** Follow "duplicate of" links back to the canonical issue.
- **Private repos or trackers.** If you can't access an issue, note that as a gap rather than guessing.

## What to return

For each relevant issue:
- Issue number or ID and title
- The problem/motivation quoted from the description or comments (not paraphrased. The synthesizer needs the exact text to cite)
- Labels, milestone, parent or tracking issue
- Author, created date, closed date
- Link to the issue
