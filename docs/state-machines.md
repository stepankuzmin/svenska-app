# State machines

Every place the app holds state that changes in steps: what the states are, what must always hold, and which event moves which state where. Domain words follow `CONTEXT.md`; the sync protocol itself is described in `docs/lookup-library-sync.md`. The last section lists the invalid states the code could reach and what became of each.

## 1. Library connection (`LibraryState` in IndexedDB)

Owner: `src/sync/store.ts`, `src/sync/model.ts`. One record, key `current`, shared by every tab of the origin.

| State | `snapshot.libraryId` | `connectionSequence` | `pending` |
| --- | --- | --- | --- |
| Local | `""` | absent | always empty (compacted) |
| Connecting | `""` | set | edits made since the attempt began |
| Paired | library UUID | absent | outbox not yet acknowledged |

Invariants

- A local library has no outbox: `compactLocal` folds every edit into `records` and sets `acknowledged = sequence`.
- `sequence` only grows, across tabs, because each edit is one IndexedDB read-write transaction (`update`).
- Every pending operation has `sequence > snapshot.acknowledged` (`receiveSnapshot`).
- A paired snapshot never moves back: a snapshot with a lower `revision` or `acknowledged` is ignored (`receiveSnapshot`).
- A snapshot from another library or another device identity is refused (`receiveSnapshot`, `accept`).

| From | Event | To | Code |
| --- | --- | --- | --- |
| Local | word opened or removed | Local (compacted) | `enqueue` |
| Local | Enable sync, Join, Recover | Connecting | `beginConnection` |
| Connecting | server snapshot accepted | Paired | `accept` |
| Connecting | definitive 4xx (not 408) on the first attempt | Local, edits folded in | `rejectConnection` |
| Connecting | 408, 5xx, timeout, lost response, or 4xx on a retry | Connecting (journal kept for the retry) | `connect` |
| Paired | operations acknowledged | Paired, outbox shorter | `reconcile` |
| Paired | Disconnect this device | Local with a new device id | `detach` |
| Paired | opening that would pass 20,000 words | Paired, unchanged, status `error` | `enqueue` |
| any | another tab changed the record | same state as that tab | `reload` |

Durability is a second axis. `durable` turns true after the first committed transaction and false on any IndexedDB failure (`storageFailed`). While it is false, edits live in memory and `localStorage` only, and a reload restores the last committed IndexedDB copy (pinned by the test "keeps every unsaved lookup visible after quota failure without changing the saved copy").

## 2. Sync status (`SyncStatus`)

Owner: `LibraryStore.setStatus`, driven by `src/sync/remote.ts`. Shown in the Sync devices panel and, for `error`, beside the attribution.

| From | Event | To |
| --- | --- | --- |
| `local` | connection starts | `connecting` |
| `connecting` | request fails | `error` |
| any but `error`, `revoked` | local edit while paired | `saving` |
| any, live transport | batch of operations sent | `saving` |
| any | outbox empty after reconcile, no rejection | `synced` |
| any | outbox empty, snapshot carries `rejectedOperation` | `error` with that message |
| any | network failure, 5xx, 429, timeout | `offline`, retry after 1 s doubling to 60 s |
| any | 401 or WebSocket close 4001 | `revoked`; transport released |
| any | 400, 403, 409, 410, 415, 422, wrong protocol | `error`; transport disposed until reload |
| any | IndexedDB failure | `error` with the storage message |
| paired | disconnect, or another tab disconnected | `local` |

Invariants

- `revoked` keeps the library id and the outbox, so words stay; only Disconnect this device leaves it.
- After a terminal `error` the store keeps the disposed transport, so later flushes do nothing until the page reloads. The terminal codes are reserved for requests that would fail the same way again (malformed input, full removal history, old protocol).

## 3. Sync transport (`createRemote`)

Owner: `src/sync/remote.ts`, `LibraryStore.startRemote`.

States: not loaded, loading (`store.remote` pending), live, stopped (`dispose`). A live transport is idle, reconciling (`running`), or waiting on a timer (`schedule`). Its WebSocket is closed, open, or waiting to reconnect with backoff.

| From | Event | To |
| --- | --- | --- |
| not loaded | `startRemote` | loading |
| loading | module loaded, still the current attempt | live |
| loading | load failed | not loaded; retry timer 1 s doubling to 60 s while paired |
| live idle | `flush`, timer, `online`, tab visible, WebSocket message | reconciling, if the Web Lock `svenska-library-sync` is free; otherwise retry in 250 ms |
| reconciling | `flush` | reconciling, `rerun` set; one more pass starts when this one ends |
| reconciling | outbox empty | idle; WebSocket opened; 30 s revision check while visible |
| reconciling | identity or library changed under it | stopped (`releaseRemote`) |
| any | `dispose` | stopped: requests aborted, timer cleared, socket closed, listeners removed |

Invariants

- Across tabs at most one reconcile or connect runs at a time, because both take the same Web Lock.
- A stopped transport never writes status or schedules work (`stopped` checks in `report`, `schedule`, `listen`, `reconcile`).
- A transport only applies snapshots for the device id and library id it started with (`accept(..., expected)`).

## 4. Operation lifecycle

| State | Where |
| --- | --- |
| Queued | `pending` in IndexedDB, with `sequence` and `baseRevision` |
| Sent | in a batch of at most 100 operations and 2 MB (`batchOf`) |
| Applied | server revision +1, `device.acknowledged = sequence` |
| Rejected | over capacity: acknowledged, records unchanged, `device.rejectedOperation` set |
| Dropped | acknowledged sequence returned to the client; `receiveSnapshot` removes it from `pending` |

Invariants (`worker/library.ts`)

- The server processes sequences in order with no gaps; a sequence at or below `acknowledged` is skipped, so a retry never applies twice.
- `rejectedOperation` survives retries of the same batch and clears at the first newly processed operation.
- One batch commits or rolls back as one SQLite transaction.

## 5. Word record (`WordRecord`)

| From | Operation | To |
| --- | --- | --- |
| absent | open, import | present, `addedAt` from the operation |
| present | open | present, moved to the top, earlier `addedAt` kept |
| present | import | present, unmoved; when the record was never removed, an earlier date replaces a later one, and so does no date when the connecting client sends `wordDates` |
| absent | remove that retains a sibling of a present source record | present, with the source's `addedAt`, placed just after the source |
| present | remove that retains it as a sibling of a present source with an earlier date, or with no date | present, with the source's `addedAt` |
| absent | remove | removed (tombstone with revision, device, sequence) |
| present | remove | removed (tombstone with revision, device, sequence) |
| removed | remove | removed; the tombstone now names this revision, device and sequence |
| removed | open that observed the removal (`baseRevision >= removedRevision`) or follows this device's own removal | present, new `addedAt` |
| removed | open that did not observe the removal | removed (removal wins) |
| removed | import | removed |

Invariants: at most 20,000 present records and 20,000 tombstones (`checkCapacity`); tombstones are never discarded; the client's replay of `pending` over the snapshot (`visibleWords`) applies the same rules as the server.

## 6. Devices and invitations (Durable Object)

| Machine | From | Event | To |
| --- | --- | --- | --- |
| Device | unknown | `initialize`, `join`, `recover` | connected (token hash, acknowledged) |
| Device | connected | `join` or `recover` again with the same id | connected, new hash, acknowledged kept, old sockets closed with 4001 |
| Device | connected | revoked by itself or another device | unknown; sockets closed with 4001 |
| Invitation | none | `invite` | issued, expires in 10 minutes, at most 5 kept |
| Invitation | issued | `join` with its token | redeemed (deleted in the same transaction) |
| Invitation | issued | 10 minutes pass | expired |
| Recovery code | set | `recovery-code` | replaced |

Invariants: at most 20 devices; a failed join (full device list, full library) rolls back and leaves the invitation unredeemed.

## 7. Lookup session (`reduceLookupSession`)

Owner: `src/lookup-session.ts`, applied optimistically by `src/use-lookup-session.ts` and confirmed by the store through `src/sync/session-bridge.ts`.

| Field | States |
| --- | --- |
| `expandedCard` | none, or the key of one word card |
| `pastedList` | none, reviewing (`added: false`), added (`added: true`) |
| `opens` | count of lookups that opened words |

| Event | Effect |
| --- | --- |
| `query-changed` | query set, extended card closed |
| `submitted`, `deep-linked`, `picked` with words | words opened, first card extended, `opens` +1 |
| `submitted`, `deep-linked` without words | nothing |
| `pasted` | reviewing; field emptied, extended card closed |
| `list-added` | added; ticked words opened as one lookup |
| `list-closed` | no list |
| `card-toggled` | that card extended, or closed if it was |
| `word-removed` | word left the library; its card no longer extended |
| `dictionary-loaded` | library words resolved through the dictionary |

Invariants

- At most one card is extended (one `expandedCard` field).
- A removed word's card is not extended, whether the removal happened here or arrived from another tab or device (fixed, see Findings). The bridge counts a word as removed only when the store's previous list held it and its new list does not, so a word a lookup just opened, which is in neither list yet, keeps its card extended.
- The card a lookup extends scrolls into view once it renders, even when its word joins the list after the lookup (fixed, see Findings).
- While a store write is in flight, the store's published words do not replace the optimistic ones (`saving` counter in the bridge); when it ends the store's copy wins, so a refused opening disappears.

## 8. Autocomplete menu (`reduceMenu`)

Owner: `reduceMenu` in `src/lookup-experience.tsx`. Fields `open`, `active` (-1 for none), `rendered`, `opens`.

| Event | Effect |
| --- | --- |
| typed | open when the field is not blank; `active` -1; first 100 rows |
| shown | open or closed (pointer down on the field, focus elsewhere) |
| moved (arrow keys) | open; `active` moves; enough rows rendered to show it |
| hovered | `active` set |
| scrolled-to-end | 100 more rows, up to the total |
| closed (Tab, Escape, Clear) | closed; `active` -1 |
| word-opened (`opens` changed) | closed; `active` -1 |

## 9. Dictionary load (`LookupState` in `src/main.tsx`)

`loading` becomes `ready` when the asset loads and parses, otherwise `unavailable-offline` (offline) or `failed`. There is no transition out of the failure states without a reload. A deep link or a paste that arrives while `loading` is held in `pendingLookup` and replayed on `ready`; a later paste replaces it.

## 10. Review schedule (one card, `src/review-schedule.ts`)

| From | Answer | To |
| --- | --- | --- |
| unseen | remembered | learning step 1, due in 10 min |
| unseen | forgot | learning step 0, due in 1 min |
| learning step 0 | remembered | learning step 1, due in 10 min |
| learning step 1 | remembered | review, interval 1 day |
| learning | forgot | learning step 0, due in 1 min |
| review | remembered | review, interval × ease (at least +1 day, half the late days credited) |
| review | forgot | relearning, interval 1, ease −0.2 (not below 1.3), due in 10 min |
| relearning | remembered | review, interval 1 day |
| relearning | forgot | relearning step 0, due in 10 min |

Invariants: review due dates fall at 4 a.m.; at most 20 new cards start and 20 review answers count per day, new cards in the launcher's "Most used" order (`reviewQueue`); undo restores the card's previous schedule and takes the answer off the day it was given.

## 11. Review round and dialog (`src/review.tsx`, `ReviewLauncher`)

Dialog: closed or open, mirrored in the URL hash `#review`. The button pushes the hash and Done goes back; a page opened at `#review` replaces the hash on Done. Back, Forward, and `popstate` follow the hash.

Round (`reduceRound`): fields `revealedCard`, `answered`, `undo`, `retry`.

| From | Event | To |
| --- | --- | --- |
| card hidden | tap, Space, Enter | revealed |
| revealed | swipe past 96 px, arrow key | next card hidden; `undo` holds the answer |
| any with `undo` | Undo, Cmd/Ctrl+Z | that card again, revealed (`retry`); `undo` cleared |
| retry | answer | next card |

Invariants

- Only a revealed card can be answered.
- The card on screen is the retried card while it is still in the deck, otherwise the next due card (fixed, see Findings).
- `answered` is in the card's React key, so each answer mounts a fresh card and cancels any animation of the previous one; a key press during a swipe-out cannot answer twice.

## 12. Gestures

Swipe to remove (`src/use-swipe-to-remove.ts`)

| From | Event | To |
| --- | --- | --- |
| idle | primary pointer down | pressed |
| pressed | moves past 8 px, more across than down | dragging (pointer captured) |
| pressed | moves past 8 px, more down than across | idle (page scrolls) |
| dragging | release past 96 px left, or a 48 px flick faster than 0.35 px/ms | leaving |
| dragging | other release, pointer cancel | idle, card settles |
| leaving | `transitionend` of `transform`, or at once under reduced motion | word removed |

Review card drag (`ReviewCard`): idle, pressed, dragging, springing back or leaving. A press without travel reveals; a release whose projected landing passes 96 px answers only when the card is revealed.

Pull to sync (`src/pull-to-sync.tsx`): idle, armed (one finger at the top, no zoom, not over a dialog or listbox, not syncing), pulling, syncing (the page springs to 60 px and rests there for at least 600 ms while `refresh` runs), springing back. A pull that turns sideways or adds a finger cancels; a release short of `min(100 px, viewport/6)` springs back. A touch while the page springs back grabs it where it is; a touch while syncing does nothing.

## 13. Sync panel (`src/sync-control.tsx`, `src/sync/panel.tsx`)

Panel closed or open; a `#pair=` fragment opens it and a new fragment remounts it (`pairingVersion`). Inside, `busy` is true for the length of one action and disables the actions. The panel shows the unpaired actions when the library is local or connecting, and the device list, invitation, recovery and disconnect actions when paired.

## Findings

Each finding was reproduced before the fix and is pinned by a regression test.

### Issue 1: a removed word's card stayed extended

Reached by swiping away an extended word card, which the domain allows ("A card removes the same way open or closed"). `word-removed` filtered the word out of the library but left `expandedCard` on its key, so the invariant "a card not in the library is not extended" broke; the card reappeared extended when the word came back through sync.

The same happened when another tab or device removed the word: the store's new list replaced `libraryWords` and left `expandedCard` alone.

- Fix: `word-removed` clears `expandedCard` when it names the removed card (`src/lookup-session.ts`), and the store bridge clears it when the store's list drops that word (`src/use-lookup-session.ts`).
- Tests: "follows the query and removes a word" in `tests/lookup-session.test.ts`; "a word removed in another tab comes back closed" in `tests/browser/lookup-library.spec.ts`.

### Issue 2: a retried review card that left the deck ended the review early

Reached by answering a card, pressing Undo, and having that word leave the deck before answering again (removed in another tab, or by sync from another device). `current` was `retry.card ?? next`; with `retry` set to a card no longer in `cards`, `current` was undefined and the dialog showed "All caught up" while the launcher counted cards still due. Undo was disabled, so only closing the dialog recovered.

- Fix: the retried card is used only while it is still in the deck, otherwise the next due card shows (`src/review.tsx`).
- Test: "an undone card removed in another tab gives way to the next due card" in `tests/browser/review.spec.ts`.

### Issue 3: a new word opened under "Most used" stayed below the screen

Reached by looking up a new, rarely used word while the library sorts by usage. The lookup commits the extended card's key first and adds the word to the list in a later view-transition update, so the scroll effect, which ran only when `opens` changed, found no extended card and never ran again. The card opened at the bottom of the list out of view.

- Fix: the effect waits until the extended card is in the sorted list, then scrolls once per lookup (`src/lookup-experience.tsx`).
- Test: "a new word opened under Most used scrolls into view" in `tests/browser/lookup-library.spec.ts`.

### Races checked and left as they are

- Two tabs answering reviews within the same moment: the review state is one `localStorage` value and the last writer wins; each tab reloads it on the `storage` event, so only answers given in the few milliseconds before that event can be lost.
- A swipe-out answer in progress uses the review state of the moment it was released; a change from another tab during its 300 ms animation is overwritten by it.
- A storage failure mid-session keeps later edits in memory and `localStorage`; reloading restores the last IndexedDB copy, as the error message's "cannot be saved" says.
- A retried operations batch that adds a new operation clears an earlier capacity rejection before the client sees it; this is the documented "until the next newly processed batch" rule.
