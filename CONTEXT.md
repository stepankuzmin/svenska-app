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
The device-local collection of words opened by the user. Opening a word adds it automatically, and a lookup opens every word its spelling holds.
_Avoid_: Saved words, favourites

**Word**:
One of the words a spelling holds, and what the lookup library keeps. Lexin numbers every word — `val 18439` the whale, `val 18440` the election — and repeats that number on every sense of a word, so a library entry survives a dictionary release that rearranges the senses. The number is the word's stable identity: the lookup indexes name words by it, and the library keeps a word by its spelling and number, since Lexin now and then gives one number to two words it spells alike but for a segment marker — `hård|kokt` of an egg, `hårdkokt` of a novel — and there the indexes name the spelling as well. A cross reference, carrying no meaning, translation or forms of its own, joins the first word of its spelling rather than standing as a word nobody can read. A library entry the dictionary no longer knows as a word opens every word its spelling holds.
_Avoid_: Sense, entry, paradigm

**Lookup result**:
All matching senses for one Swedish headword, shown whether the search began in Swedish or Russian. The senses Lexin inflects alike make one word, and the lookup opens the first of them.
_Avoid_: Russian-Swedish entry, individual sense result

**Word card**:
The compact, left-aligned presentation of one word. Its closed state shows the headword, transcription, word type, Swedish forms, meanings, and Russian translations.

One spelling can hold more than one word, and each fills a card of its own, carrying the meanings, examples and related words that belong to it:

```
val   en val, valen, valar, valarna    stort fiskliknande däggdjur i havet   кит
val   ett val, valet, val, valen       offentlig röstning                    выборы
```

Senses share a card when one paradigm spells the other out in full, so a spelling Lexin inflects one way keeps one card.
_Avoid_: Suggestion card, library row

**Swedish forms**:
The inflected forms shown on a word card. A verb reads in citation order: `att framgå, framgår, framgick, har framgått`. A noun opens with the article its gender calls for: `ett intryck, intrycket, intryck, intrycken`. The gender comes from the definite singular Lexin spells out, so a word Lexin lists only in the plural keeps its bare headword. A noun Lexin leaves at the definite singular and the plural reads with the definite plural its pattern implies: `en val, valen, valar, valarna`. Every other word type keeps the Lexin order, headword first. A card carries the one paradigm its word inflects by.
_Avoid_: Inflection list, paradigm

**Extended word card**:
The open state of a word card, adding Lexin examples and related words that contain the headword. At most one word card is extended in the lookup library. A word with neither examples nor related words has no extended state, and its card carries no disclosure.
_Avoid_: Expanded result, accordion item

**Removing a word**:
A word leaves the lookup library by a swipe to the left across its card, which uncovers the control that removes it. The card follows the finger, comes back when it is let go short of the threshold, and leaves to the left on a long pull or a flick; the library closes the gap behind it. A word cannot be brought back, so a short pull carries one off only when it is fast enough to read as a flick. A card removes the same way open or closed, and a swipe that comes back leaves a closed card closed. Keyboard focus uncovers the same control, so the gesture is not the only way out. A removed word returns by looking it up again.
_Avoid_: Delete, swipe action, undo

**Lookup autocomplete**:
The transient listbox of matching indexed words attached directly to the search field while the user types. Each suggestion names one word, so a spelling that holds two words — `fast` the adjective and `fast` the conjunction — is offered twice. Every suggestion carries the word it opens: a Swedish suggestion its word type and Russian translation, and the headword when it is an inflected form; a Russian suggestion the Swedish word and its type. Where two suggestions would still read alike, as `jord` the planet and `jord` the soil, each adds its Swedish meaning. Selecting a suggestion closes the listbox, opens the word card for that word, and adds that word alone to the lookup library.
_Avoid_: Suggestions section, suggestion cards

## Lookup interaction

The lookup area responds to every non-blank change in the search field. It shows every indexed Swedish word containing the query, once for each word it leads to. An inflected form leads only to the word it inflects. Exact matches come first, followed by prefix matches and then other substring matches. Selecting an inflected form opens its canonical headword. No visible message replaces the library when there is no match.

A Russian query shows every Russian index entry containing the entered text, once for each Swedish word that carries the translation. Exact and whole-word matches appear before prefix and other substring matches. Selecting a Russian suggestion opens that Swedish word.

Typing previews matching words in the lookup autocomplete without adding them to the lookup library. Submitting an exact word opens that lookup and adds every word its spelling holds to the library; choosing a suggestion adds the one word it names.

A swipe to the left across a word card removes that word from the lookup library, and nothing else does.

The production interface contains only the lookup autocomplete and the lookup library. The search field receives focus when the app starts, and holds a clear control while it contains text: clearing empties the field, closes the autocomplete, and keeps the focus and the lookup library. This keeps the first keystroke path free of navigation, submit controls, and explanatory content.
