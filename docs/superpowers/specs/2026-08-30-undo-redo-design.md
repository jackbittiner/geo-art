# Undo / Redo — Design Spec

**Date:** 2026-08-30
**Status:** Approved design, pending implementation plan
**Parent spec:** `docs/superpowers/specs/2026-08-29-geometric-art-tool-design.md`
**Phase:** 2, piece E of five

---

## 1. Purpose

Make edits reversible.

Every change to a geo-art document is currently permanent. Autosave and
save/load mean a reload never loses work, so this is not data protection — it is
the freedom to experiment. Several decisions in earlier pieces already lean on
reversibility that does not exist yet: the modulation `~` toggle deliberately
makes a visible change on the way in, and the Fill and Stroke toggles stash their
value, both because a mis-click would otherwise be unrecoverable. Undo makes
those safety nets general rather than per-feature.

## 2. Where this sits in Phase 2

| | Piece | Status |
|---|---|---|
| A | Modulation UI | done |
| B | Chains + repeater library | not started |
| C | More shapes | not started |
| D | Performance | not started |
| **E** | **Undo/redo — this spec** | **this piece** |

E is fully independent of the others and can land at any point.

## 3. Scope

### In scope

- A history of documents, with undo and redo.
- Drag coalescing, so one gesture is one entry.
- ⌘Z / ⇧⌘Z (Ctrl on non-Mac), plus Undo and Redo buttons in the top bar.
- Loading a file or a starter is undoable.

### Out of scope

- The rest of the parent spec §10.5's shortcuts — ⌘D duplicate, ⌫ delete,
  `R` re-roll, space-pan. Each is unrelated to undo and needs its own thought.
- Undoing viewport changes. Pan and zoom are how you look at the piece, not
  changes to it; undoing a pan would be surprising.
- Undoing selection. The selection *changes* as a consequence of undo — a
  restored document may not contain the selected layer — but selecting a layer
  is not itself an undoable act.
- Persisting history across a reload. It lives in memory for the session.
- Any engine, schema, renderer or document-operation change.

## 4. The behaviour this settles

**One gesture is one entry.** Dragging hue from 280° to 40° is a single undo
step however many pixels it took. The group closes when the pointer is released,
and also after a short idle gap — range inputs fire no pointer events when
driven by arrow keys, so release alone would merge an afternoon of keyboard
nudges into one entry.

**A load is undoable.** Opening the wrong file over an hour's work is currently
unrecoverable, and it is the worst thing that can happen to a user of this tool.
`setDoc` records like any other change, so ⌘Z brings the previous document back.
The autosave restore on mount is the exception — there is nothing behind it to
return to.

## 5. Architecture

### 5.1 A pure history module

`src/state/history.ts` — no React, no zustand:

```ts
export type Entry = { doc: Document; key: string | null; at: number }
export type History = { past: Entry[]; future: Entry[] }

export const MAX_ENTRIES = 100
export const COALESCE_IDLE_MS = 400

export function emptyHistory(): History
export function record(h: History, previous: Document, key: string | null, now: number): History
export function undo(h: History, current: Document): { history: History; doc: Document } | null
export function redo(h: History, current: Document): { history: History; doc: Document } | null
export function closeGroup(h: History): History
```

`now` is a parameter rather than a call to `Date.now()`. The store supplies the
clock; tests supply exact numbers and control the idle window without fake
timers.

### 5.2 How coalescing falls out of the data structure

`record` stores the document **as it was before the edit**. When an op arrives
carrying the same key as the newest entry, within `COALESCE_IDLE_MS` of it, it
records **nothing** — the group is already open, and the entry already sitting in
`past` is exactly the pre-drag state.

So "one gesture, one entry" is not a special case. It is what the structure does
when nothing is pushed. `closeGroup` sets the newest entry's key to `null`, so
the next op cannot join it however soon it arrives.

`undo` moves the newest `past` entry into the document and pushes the outgoing
document onto `future`; `redo` is its mirror. Any `record` clears `future` — the
standard rule, and the one users expect.

The cap drops the **oldest** entry rather than refusing the newest, so a long
session degrades by forgetting its beginning rather than by silently ceasing to
record.

### 5.3 Store

`src/state/store.ts` gains `history` and four actions, and `apply` gains an
optional key:

```ts
history: History
apply: (fn: (doc: Document) => Document, coalesceKey?: string) => void
setDoc: (doc: Document) => void        // records — a load is undoable
hydrateDoc: (doc: Document) => void    // does not record — the autosave restore
undo: () => void
redo: () => void
endCoalesce: () => void
```

```ts
apply: (fn, coalesceKey) =>
  set((state) => {
    const doc = fn(state.doc)
    if (doc === state.doc) return state
    return {
      doc,
      history: record(state.history, state.doc, coalesceKey ?? null, Date.now()),
      selectedLayerId: reconcileSelection(doc, state.selectedLayerId),
    }
  }),
```

The identity guard matters. `src/document/ops.ts` returns the input document by
reference when an id is not found — a convention a Phase 1 review made uniform
across the module — so a no-op edit records no entry, for free.

`canUndo` and `canRedo` are derived at the call site
(`useStore((s) => s.history.past.length > 0)`) rather than stored booleans that
could drift from the history they describe.

`hydrateDoc` is a second name rather than a boolean argument, so the call site
says which it means. `useAutosave`'s restore is its only caller.

### 5.4 UI

**Sliders.** `FieldRow` and `ModulatorEditor` gain an optional
`onCommit?: () => void`, fired on `pointerup` and `blur`. The Inspector supplies
it, along with a coalesce key per row built from the row's scope and descriptor
key.

Both components stay store-free. Their entire test suite drives them with plain
props and a `vi.fn()`, and reaching into the store from inside them would cost
that.

**Keyboard.** `src/ui/useKeyboard.ts`, called from `App`: a `window` keydown
listener for ⌘Z and ⇧⌘Z (Ctrl on non-Mac), ignoring events whose target is an
`input` or `select` so number fields keep their native undo.

**Buttons.** Undo and Redo in the top bar, disabled when there is nothing to do.
The shortcut is for speed; the buttons are how the feature is discovered.

### 5.5 Interaction with autosave

`useAutosave` has two effects, and only the restore one changes. Its **save**
effect watches `doc` and is unaffected: an undo replaces `doc`, so the debounced
write fires and localStorage ends up holding the undone state, which is correct —
autosave should reflect what is on screen.

Its **restore** effect switches from `setDoc` to `hydrateDoc`. Everything else
about it is untouched, including the mount-time identity guard that a Phase 1
review had to correct twice: the first version counted effect invocations, which
StrictMode's double-invoke defeats, and the working version asks whether anything
has replaced the document present at mount. `hydrateDoc` does not disturb that —
it replaces `doc` exactly as `setDoc` did.

The three `setDoc` callers today divide cleanly: `TopBar`'s file load and
`EmptyState`'s starter both record; `useAutosave`'s restore hydrates.

## 6. Data flow

```
slider drag ──► apply(fn, "fill-h") ──► record(history, previousDoc, "fill-h", now)
                                          │  same key, inside the window?
                                          │     yes → record nothing
                                          │     no  → push previousDoc
pointer up  ──► endCoalesce() ──────────► closeGroup(history)

⌘Z          ──► undo() ─────────────────► past.pop() becomes doc; current → future
```

## 7. Testing

**The pure module carries the weight.** A second op with the same key inside the
window records nothing; the same key outside the window records a new entry; a
different key always records; `closeGroup` makes the next same-key op start
fresh; undo and redo round-trip; a new edit after an undo clears the future; the
cap drops the oldest entry.

**Two traps specific to this feature**, both the shape that has caught this
project eleven times across two phases:

1. **The no-op guard must be asserted in both directions.** "An op returning the
   document by reference records nothing" passes trivially against an
   implementation that records nothing ever. It means something only when paired
   with "an op that genuinely changes the document does record."
2. **Every undo test needs visibly different documents.** Asserting that undo
   restored *a* document proves nothing when the fixture's before and after are
   equal; the before-state must differ in a way the assertion names.

**Store tests** cover the seams: `apply` records, `setDoc` records, `hydrateDoc`
does not, undo reconciles the selection when the restored document lacks the
selected layer, and the coalesce key reaches `record` intact.

**UI tests** are thin: the Inspector passes a key and an `onCommit` to each row,
and the keyboard hook fires undo on ⌘Z but not when focus sits in an input.

**Mutation verification is required** for the coalescing rule and the no-op
guard. Both are the kind of logic whose tests pass by coincidence when the
fixture picks convenient values.

## 8. Key decisions

| Decision | Rationale | Cost if wrong |
|---|---|---|
| A pure `history.ts`, store owns an instance | The tricky part stays testable without a store or a DOM; matches the parent spec's file map | An extra module for ~100 lines |
| Coalesce closes on release **and** on idle | Release alone misses keyboard-driven changes, which fire no pointer events | An idle threshold to tune; 400ms is a starting point |
| `record` stores the pre-edit document | Makes "one gesture, one entry" the structure's default rather than a special case | None identified |
| A load is undoable | Loading over an hour's work is the worst recoverable-in-principle disaster the tool allows | History can hold two unrelated pieces at once |
| `hydrateDoc` as a separate action | A boolean argument at a call site does not say what it means | One more action on the store |
| Derived `canUndo`/`canRedo` | Stored booleans drift from the history they describe | Recomputed per render; trivial |
| Cap at 100, drop oldest | A long session should forget its beginning, not stop recording | Very old states unreachable |
| Components stay store-free | Preserves the existing prop-driven test suites for `FieldRow` and `ModulatorEditor` | `onCommit` plumbed through two components |

## 9. Deferred

- **The rest of §10.5's shortcuts** — ⌘D, ⌫, `R`, space-pan.
- **Persisting history across reloads.** Would need the stack in localStorage
  alongside the document, and a policy for how much.
- **Naming entries** ("undo hue change") for a visible history panel. The `key`
  is already carried and would be most of the work.
- **Coalescing across a chain of ops** — a single user action that dispatches
  two ops would record two entries. No such action exists today.
