## Domain vocabulary

Read `CONTEXT.md` before exploring the codebase, and name domain concepts the way its glossary does.

## Constraints

Read `CONSTRAINTS.md` before writing code. Do not weaken it to make a change pass. Run `npm run check:fast` after edits and `npm run check:task` before reporting completion.

## Design system

Read `DESIGN_SYSTEM.md` before changing styles, and take colours and type sizes from its tokens.

## Public GitHub actions

A public action is anything visible on GitHub to other people: a comment, review, reply, reaction, review-thread resolution, review request, label, or change to PR or issue metadata. Pushing a branch and opening a PR also count. GitHub shows these as the user's account, so this section says when the user has already approved them.

**Autonomous run.** A run is autonomous when it starts from a scheduled routine or trigger, or when the user says to work on your own, autonomously, or without asking. In an autonomous run the user has already approved exactly two public actions, and you take them without asking:

1. Push your commits to the session's designated branch.
2. Open one pull request for the work, with a title and description that say what changed and why. Do this whenever the run produced a change a human should review. Do not stop at pushing the branch, and do not leave the PR for the user to open. If the run found nothing worth changing, open no PR.

**Everything else needs the user's explicit approval in that conversation**, in an autonomous run as well as an interactive one. That covers comments, replies, reviews, reactions, resolving threads, requesting reviewers, labels, PR or issue edits after creation, closing, and merging. Never write or post anything in the user's name that the user has not approved. When such an action seems useful, prepare it, say so in your final report, and leave it unposted. Replying to review comments on a PR you opened is not covered by the PR approval.

**Interactive run.** Do only the public actions the user asked for, scoped to that request. "Open a PR" covers opening that PR and nothing after it. "Babysit the PR" covers read-only monitoring plus in-scope code changes, commits and pushes. It does not cover comments, replies or metadata changes.

The account GitHub displays is not a reason to hold back an action this section approves.

## Linting

Run `npm run lint` before reporting completion.

## Browser verification

For UI, mobile, or PWA changes, run `npm run test:browser` before reporting completion. It builds the shipped app, runs the production journey in Chromium and WebKit, and runs the touch test on the Pixel and iPhone profiles. The production journey stays on the desktop profiles because three of its tests assert the search field is focused on load, which the app suppresses on a coarse pointer. If local socket permissions block the command, rerun it with the required sandbox escalation; an `EPERM` startup error is not a test result.
