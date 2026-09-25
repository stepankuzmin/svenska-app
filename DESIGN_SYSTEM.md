# Design system

The tokens live on `.minimal-lookup` in `src/lookup-experience.css`. This file names their roles; the CSS holds the values.

## Colour

| Token | Light | Dark | Role |
|---|---|---|---|
| `--lookup-background` | `#f1f1ef` | `#1c1c1e` | Page |
| `--lookup-card` | `#fff` | `#2c2c2e` | Field, menu and card surfaces |
| `--lookup-ink` | `#171719` | `#f2f2f7` | Primary text |
| `--lookup-muted` | `#68686d` | `#b0b0b5` | Forms, transcription, word type, placeholder, labels, attribution |
| `--lookup-line` | `#c7c7cc` | `#646469` | Card list border |
| `--lookup-soft-line` | `#dedede` | `#48484c` | Dividers inside a list |
| `--lookup-blue` | `#075eb8` | `#0a84ff` | Focus and the open combobox outline |
| `--lookup-destructive` | `#b3261e` | `#c5372c` | Remove control |
| `--lookup-field-line` | `#8e8e93` | `#68686d` | Field and menu border |
| `--lookup-control` | `#d4d4d8` | `#636367` | Clear button; pressed mixes 20% ink |
| `--lookup-selected` | `#e9f2fc` | `#19395a` | Active or hovered suggestion |
| `--lookup-hover` | `#f3f8fd` | `#15293d` | Hovered word card |

## Type

The system font stack, with optical sizing on and no manual letter-spacing. The field stays at `1rem` so iOS does not zoom into it.

| Token | Size | Used for |
|---|---|---|
| `--text-headword` | `1.0625rem` | Word card headword |
| `--text-body` | `.9375rem` | Russian on the closed card, meanings, examples, related words, status |
| `--text-secondary` | `.8125rem` | Forms, transcription, word type, suggestion forms, Remove |
| `--text-label` | `.75rem` | Section labels, attribution |

Each weight has one role: 700 for the headword, 500 for the Russian translation, 600 for section labels, and 400 for everything else. Labels are in sentence case.

## Layout

- The column is `38rem` wide, centred, with a `1rem` gutter plus safe-area insets. From `48rem` up, the top gutter is `3rem`.
- A closed word card is one line: the headword, its word type in `--lookup-muted`, and the Russian at weight 500. Transcription, forms and meanings appear only when the card is open.
- A word card has two left edges: the disclosure gutter and the text column. Everything in the card starts on the text column.
- Corners are `.65rem` on the field, the menu and the card list.
- A suggestion menu that runs on ends halfway through a row, at most 6½ rows and half the dynamic viewport, and that half row fades into `--lookup-card` until the list is scrolled to its end. A menu that fits shows every row whole.
