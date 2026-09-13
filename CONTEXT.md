# Svenska.app

An offline Swedish-Russian vocabulary application. It turns a versioned Lexin source edition into a deployable dictionary release.

## Language

**Dictionary release**:
A set of content-hashed JSON lookup and word-detail files produced from one Lexin source edition and deployed with a specific application release. The browser and static host handle ordinary HTTP compression.
_Avoid_: Live dictionary, downloaded source XML

**Source edition**:
The dated Lexin XML publication from which a dictionary release is derived.
_Avoid_: Live source, current Lexin data

**Cached dictionary**:
The dictionary release precached with the application by its generated service worker for offline lookup after one online visit.
_Avoid_: Installed dictionary, downloaded dictionary, permanent dictionary

The application registers that service worker during startup. A first installation claims the page without interrupting it; when a later dictionary release takes control of an existing page, the page reloads once so it cannot remain on the previous application shell.

**Lookup library**:
The device-local collection of dictionary entries opened by the user. Opening an entry adds it automatically.
_Avoid_: Saved words, favourites

**Lookup result**:
All matching senses for one Swedish headword, shown together whether the search began in Swedish or Russian.
_Avoid_: Russian-Swedish entry, individual sense result

**Word card**:
The compact, left-aligned presentation of one lookup-library entry. Its closed state shows the headword, transcription, word type, inflections, meanings, and Russian translations.
_Avoid_: Suggestion card, library row

**Extended word card**:
The open state of a word card, adding Lexin examples and related words that contain the headword. At most one word card is extended in the lookup library.
_Avoid_: Expanded result, accordion item

**Lookup autocomplete**:
The transient, headword-only listbox attached directly to the search field while the user types. Selecting a suggestion closes the listbox, opens its word card, and adds that entry to the lookup library.
_Avoid_: Suggestions section, suggestion cards

## Lookup interaction

The lookup area responds to every non-blank change in the search field. It shows matching Swedish headwords in the lookup autocomplete. No visible message replaces the library when there is no match.

Typing previews matching words in the lookup autocomplete without adding them to the lookup library. Submitting an exact word or choosing a suggestion opens that lookup and adds it to the library.

The production interface contains only the lookup autocomplete and the lookup library. The search field receives focus when the app starts. This keeps the first keystroke path free of navigation, submit controls, and explanatory content.
