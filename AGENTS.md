## Domain vocabulary

Read `CONTEXT.md` before exploring the codebase, and name domain concepts the way its glossary does.

## Constraints

Read `CONSTRAINTS.md` before writing code. Do not weaken it to make a change pass. Run `npm run check:fast` after edits and `npm run check:task` before reporting completion.

## Design system

Read `DESIGN_SYSTEM.md` before changing styles, and take colours and type sizes from its tokens.

## Public GitHub actions

Act publicly only through an identity that GitHub visibly attributes to Codex or the Codex bot. This includes comments, reviews, replies, reactions, review-thread resolution, review requests, and PR or issue metadata changes.

Before each public action, verify which GitHub account will be displayed. If the action would be attributed to the user, or the displayed identity cannot be verified, prepare the action but wait for the user's explicit approval before executing it.

Scope approval to the exact requested action. A request to create a PR authorizes creating that PR, but not later comments or other public actions. "Babysit the PR" authorizes read-only monitoring and in-scope code changes, commits, and pushes; it does not authorize public communication or PR metadata changes.

## Git commits

Create Codex-authored commits with `git commit --author="Codex <199175422+chatgpt-codex-connector[bot]@users.noreply.github.com>"`; leave the user's Git configuration unchanged.

## Linting

Run `npm run lint` before reporting completion.

## Browser verification

For UI, mobile, or PWA changes, run `npm run test:browser` before reporting completion. It builds the shipped app, runs the production journey in Chromium and WebKit, and runs the touch test on the Pixel and iPhone profiles. The production journey stays on the desktop profiles because three of its tests assert the search field is focused on load, which the app suppresses on a coarse pointer. If local socket permissions block the command, rerun it with the required sandbox escalation; an `EPERM` startup error is not a test result.
