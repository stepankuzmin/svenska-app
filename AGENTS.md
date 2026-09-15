## Agent skills

### Issue tracker

Issues are tracked in the Linear project "svenskaapp"; agents may create and update issues. See `docs/agents/issue-tracker.md`.
Agents may also post Linear comments on the user's behalf when recording work in this repository.

### Triage labels

Use the default canonical triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context domain-doc layout. See `docs/agents/domain.md`.

## Public GitHub actions

Act publicly only through an identity that GitHub visibly attributes to Codex or the Codex bot. This includes comments, reviews, replies, reactions, review-thread resolution, review requests, and PR or issue metadata changes.

Before each public action, verify which GitHub account will be displayed. If the action would be attributed to the user, or the displayed identity cannot be verified, prepare the action but wait for the user's explicit approval before executing it.

Scope approval to the exact requested action. A request to create a PR authorizes creating that PR, but not later comments or other public actions. "Babysit the PR" authorizes read-only monitoring and in-scope code changes, commits, and pushes; it does not authorize public communication or PR metadata changes.

## Git commits

Create Codex-authored commits with `git commit --author="Codex <199175422+chatgpt-codex-connector[bot]@users.noreply.github.com>"`; leave the user's Git configuration unchanged.
