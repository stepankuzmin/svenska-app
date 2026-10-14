# Incident & Postmortem Context

Not a separate source, a **cross-cutting angle**. Incidents often motivate defensive code ("we added this check after the X outage"), so if the target looks defensive (null checks, retry logic, timeout handling, rate limiting, feature flags), specifically hunt for incident history across every available source:

- **Docs**: search for postmortems mentioning the target file, feature, or error string
- **Issues**: look for issues labeled `incident`, `sev-*`, `postmortem-action-item`, `reliability`
- **Slack**: search `#sev-*` and `#incident-*` channels around the dates the target code was added
- **Git**: commits with messages like "fix for incident", "add defensive check", "revert" followed by "re-apply with..." are strong signals

If you find an incident link, fetch the full postmortem. Postmortems typically have an "Action Items" section that ties directly to code changes. When multiple sources corroborate (an issue links a postmortem doc, which links a Slack thread, which links the target PR), the evidence is especially strong.

Worth spending time on when the code's defensive character makes an incident-driven origin plausible. Skip it for code that doesn't look defensive.
