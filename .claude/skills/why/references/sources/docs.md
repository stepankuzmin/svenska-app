# Docs

## What this source contains

- PRDs (product requirement documents)
- Technical specs and RFCs
- Architectural decision records (ADRs)
- Meeting notes from design reviews
- Postmortems from incidents
- Runbooks that may explain defensive code

Long-form docs are where "why" often lives before it becomes code. A significant feature usually has a doc.

## How to search it

Google Drive MCP. For Confluence or Notion, map each step to its tools.

1. **Keyword searches.** Search file contents and titles for:
   - The feature name
   - Key symbols / class names from the target code
   - Error strings or user-visible terms
   - The PR author's name, since design docs are often written before the code lands
2. **Read candidate docs in full.** Not the preview or snippet. Rationale is often buried mid-document.
3. **Follow links.** Design docs link alternatives-considered docs, appendices, and meeting notes. Pull them.
4. **Bound by time.** If you know when the code shipped, look at docs modified in the months before it.

## What good evidence looks like here

- A PRD with a "Problem statement" or "Motivation" section that matches the target code's purpose
- An "Alternatives considered" or "Rejected approaches" section
- A postmortem that names the target code as the fix for a specific incident
- Meeting notes that record "we decided X because Y" and tie to the same author/date range as the PR
- An ADR filled out non-trivially (status, context, decision, consequences)

## Common pitfalls

- **Outdated docs.** Specs are often written before implementation and not updated. The doc may describe a plan that changed. Cross-check against the actual PR.
- **Doc vs. reality drift.** A spec may say "we'll do X" but the code actually does Y. Flag the divergence. The synthesizer will surface the contradiction.
- **Boilerplate templates.** Some orgs require a "Why" section that gets filled with fluff. Look for specificity.
- **Unlinked docs.** The most relevant doc may not be linked from anywhere. Broad keyword searches help.
- **Multiple drafts.** If a topic has multiple docs, find the one that was finalized or most recently updated. Check dates.
- **Access-restricted docs.** If you can't open a doc, note it as a gap.

## What to return

For each relevant doc:
- Title and URL
- Authors and last-modified date
- The motivation text (verbatim quote), with section location
- Relevant linked docs (so the synthesizer can cite them)
- Whether the doc was finalized or a draft
