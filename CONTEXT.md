# Svenska.app

An offline Swedish-Russian vocabulary application. It turns a versioned Lexin source edition into a deployable dictionary release.

## Language

**Dictionary release**:
A content-hashed JSON lookup file produced from one Lexin source edition and deployed with a specific application release. The browser and static host handle ordinary HTTP compression.
_Avoid_: Live dictionary, downloaded source XML

**Source edition**:
The dated Lexin XML publication from which a dictionary release is derived.
_Avoid_: Live source, current Lexin data

**Cached dictionary**:
The dictionary release precached with the application by its generated service worker for offline lookup after one online visit.
_Avoid_: Installed dictionary, downloaded dictionary, permanent dictionary

**Lookup library**:
The device-local collection of dictionary entries opened by the user. Opening an entry adds it automatically.
_Avoid_: Saved words, favourites

**Lookup result**:
All matching senses for one Swedish headword, shown together whether the search began in Swedish or Russian.
_Avoid_: Russian-Swedish entry, individual sense result

## Lookup interaction

The lookup area responds to every non-blank change in the search field. It shows a lookup result, matching word choices, or the no-match message while the user types.

Typing previews a lookup without adding it to the lookup library. Submitting an exact word or choosing a matching word opens that lookup and adds it to the library.
