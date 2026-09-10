# Svenska.app

An offline Swedish-Russian vocabulary application. It turns a versioned Lexin source edition into a deployable dictionary release.

## Language

**Dictionary release**:
A content-hashed, gzip-compressed JSON lookup file produced from one Lexin source edition and deployed with a specific application release.
_Avoid_: Live dictionary, downloaded source XML

**Source edition**:
The dated Lexin XML publication from which a dictionary release is derived.
_Avoid_: Live source, current Lexin data

**Installed dictionary**:
A dictionary release stored by the browser for offline lookup on one device.
_Avoid_: Permanent dictionary, synced library

**Lookup library**:
The device-local collection of dictionary entries opened by the user. Opening an entry adds it automatically.
_Avoid_: Saved words, favourites

**Lookup result**:
All matching senses for one Swedish headword, shown together whether the search began in Swedish or Russian.
_Avoid_: Russian-Swedish entry, individual sense result
