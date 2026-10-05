## Domain vocabulary

Read `CONTEXT.md` before exploring the codebase, and name domain concepts the way its glossary does.

## Constraints

Read `CONSTRAINTS.md` before writing code. Do not weaken it to make a change pass. Run `npm run check:fast` after edits and `npm run check:task` before reporting completion.

## Design system

Read `DESIGN_SYSTEM.md` before changing styles, and take colours and type sizes from its tokens.

## Autonomous work and pull requests

A run is autonomous when a scheduled routine or trigger starts it, or when the user tells you to work on your own, autonomously, or without asking. Treat a delegated change as yours to finish. The goal is a pull request that is ready for human review, not a branch that needs more work.

### What you may do without asking

In an autonomous run, and on any PR you opened or were asked to babysit, you may do all of the following. The user has approved them in advance, even though GitHub shows them as the user's account.

- Push commits to the session's designated branch.
- Open one PR for the work, with a title and description that say what changed and why. Open it whenever the run produced a change worth reviewing. If the run found nothing worth changing, open no PR.
- Comment on that PR, reply to review comments, and resolve review threads you have addressed.
- Edit that PR's title, description, labels and reviewers.
- Request a review from Codex or Claude. Mention the reviewer in a PR comment (`@codex review` or `@claude review`), or use a review-request tool when one exists. Request a re-review after each round of fixes.
- Keep the PR current with its base branch by merging the base in.

Babysitting a PR means the same thing: you may monitor it, change its code, push, and talk on its threads without waiting for approval.

### Review rounds

1. Before opening the PR, run the checks below and fix every failure.
2. Open the PR, then request an exhaustive review from Codex or Claude.
3. Read every finding. Verify it against the code. Fix the ones that are correct and significant, then reply on the thread with what you changed or why you did not change it, and resolve the thread.
4. Push, then request another review. Repeat until a round raises nothing significant. Nits and style preferences do not need another round. Do not loop on them.
5. Finish when CI is green, the PR merges cleanly, no thread is open, and the reviewers have nothing significant left. Then report that the PR is ready for human review.

If a reviewer and you disagree on something significant after two rounds, stop arguing. State both positions in a PR comment and leave the decision to the human.

### What still needs the user's approval

- Merging or closing a PR, or enabling auto-merge.
- Approving a PR on the user's behalf.
- Any action on a PR or issue you did not open and were not asked to babysit, including comments, reviews, reactions and labels.
- Writing anything in the user's name outside the PR you own, such as in Slack, issues or other repositories.
- Weakening a check, a threshold or this file to get a PR through.

When one of these seems useful, prepare it, describe it in your final report, and leave it undone.

### Interactive runs

Outside autonomous runs, do only the public actions the user asked for. "Open a PR" covers opening that PR. Once the PR is open, "babysit it" or "get it ready" covers the rest of this section for that PR.

## Git commits

Commit with the repository's configured Git identity, and end each commit message with the attribution lines the session provides. Do not change the user's Git configuration, and do not name another author.

## Linting

Run `npm run lint` before reporting completion.

## Browser verification

For UI, mobile, or PWA changes, run `npm run test:browser` before reporting completion. It builds the shipped app, runs the production journey in Chromium and WebKit, and runs the touch test on the Pixel and iPhone profiles. The production journey stays on the desktop profiles because three of its tests assert the search field is focused on load, which the app suppresses on a coarse pointer. If local socket permissions block the command, rerun it with the required sandbox escalation; an `EPERM` startup error is not a test result.
