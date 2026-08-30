# Chained Repeaters + the Grid Repeater — Design Spec

**Date:** 2026-08-30
**Status:** Approved design, pending implementation plan
**Parent spec:** `docs/superpowers/specs/2026-08-29-geometric-art-tool-design.md`
**Phase:** 2, piece B of five (first of two — `path` and `recursive` are deferred)

---

## 1. Purpose

Make repetition compose.

A layer can hold a chain of repeaters today — `repeaters` is already
`RepeaterConfig[]`, and `expandChain` in `evaluate.ts` already walks it and
composes transforms. What is missing is any way to *build* one: the inspector
renders the array but offers no add, remove, reorder or retype, and only one
repeater type exists to chain with.

So this piece ships the two halves that make the existing engine reachable: the
chain operations and their UI, and a second repeater type genuinely unlike the
first. A radial ring of grids and a grid of radial bursts both become possible,
and neither requires an engine change.

## 2. Where this sits in Phase 2

| | Piece | Status |
|---|---|---|
| A | Modulation UI | done |
| **B** | **Chains + repeater library — this spec covers chains and `grid`** | **this piece** |
| C | More shapes | not started |
| D | Performance | not started |
| E | Undo/redo | done |

The parent spec's §13 lists `grid`, `path` and `recursive` under Phase 2. This
spec takes `grid` only. `path` needs a decision about what defines the path;
`recursive` feeds its own output back in and is the one type that does not fit
the `expand(config, parent, limit)` interface as written. Each gets its own
spec.

## 3. Scope

### In scope

- A `grid` repeater: rows × columns, spacing, per-copy spin.
- Four pure chain operations: add, remove, move, retype.
- Inspector controls for those, in each repeater card's header.
- Per-level instance counts, so each card shows its own contribution and the
  running product.

### Out of scope

- The `path` and `recursive` repeater types.
- Repeater ids. Cards stay keyed positionally; see §6.3 for what that costs.
- Any change to `expand`'s signature, `evaluate()`'s structure, or
  `expandChain`. If the work appears to need one, the design is wrong.
- Preserving field values across a type change. See §5.4.
- A cap on chain length. `maxInstances` already bounds the real cost.

## 4. The grid repeater

`src/geometry/repeaters/grid.ts`, implementing the same `Repeater<C>` interface
`radial` already satisfies, registered in the existing `REGISTRY`.

```ts
export type GridConfig = {
  type: 'grid'
  rows: Field
  cols: Field
  /** px between column centres. */
  spacingX: Field
  /** px between row centres. */
  spacingY: Field
  /** Degrees. Rotation of each copy about its own centre. */
  spin: Field
}
```

### 4.1 Centred on the parent origin

Offsets run from `-(cols - 1) / 2 * spacingX` to `+(cols - 1) / 2 * spacingX`,
and likewise for rows. Centring is what makes a grid composable: dropped inside
a radial, each ring copy gets a grid around *itself* rather than a grid hanging
off to one side. A corner-anchored grid would make every chain lopsided.

### 4.2 The three contracts inherited from `radial`

- **`limit`.** Emit `min(rows * cols, limit)` placements in row-major order,
  but every child's `ctx.counts` records the *full* intended count.
  `expandChain` compares the two to distinguish real truncation from a count
  that was simply smaller than the budget. A truncated grid is therefore the
  first N cells of the intended grid, correctly positioned and modulated — not
  N cells of a redistributed smaller grid.
- **`t` is the flat position**, `i / (rows * cols - 1)`, so a `spin` ramp
  sweeps the whole grid rather than resetting each row. Guard the
  single-cell case: `rows * cols <= 1` gives `t = 0`.
- **`perCopy`.** `rows`, `cols`, `spacingX` and `spacingY` resolve against the
  *parent* context and cannot vary between siblings, so they get no `~` toggle.
  Only `spin` resolves against the child. This is the existing rule from
  the parent spec §4a, not a new one.

## 5. Schema and operations

### 5.1 The union

`repeaterSchema` gains a second member; `RepeaterConfig` becomes
`RadialConfig | GridConfig`. That union is the single place the type list
lives — `RepeaterType`, the registry and `REPEATER_FIELDS` all derive from it,
so the compiler points at every site needing a grid case.

### 5.2 Four pure ops

In `src/document/ops.ts`, following the module's conventions exactly:

```ts
addRepeater(doc, layerId, type): Document
removeRepeater(doc, layerId, index): Document
moveRepeater(doc, layerId, index, delta): Document
setRepeaterType(doc, layerId, index, type): Document
```

**Each returns the input document by reference when nothing matched** — unknown
layer id, index out of range, a move that would leave the array unchanged. This
is not decoration. The store's `apply` uses object identity to decide whether to
record an undo entry, so an op returning a fresh-but-identical document puts a
phantom step in the history: ⌘Z appears to do nothing, and the Undo button
greys out for no visible reason. A Phase 1 review made the convention uniform
across the module for this reason.

### 5.3 `removeRepeater` refuses to empty the chain

A layer with zero repeaters evaluates to a single instance at the origin — a
state the engine handles correctly — but the Repeat section then vanishes with
no way back except undo. Removing the last repeater returns the document
unchanged (by reference, per §5.2), and the UI disables `×` at length 1.

### 5.4 A type change replaces the config

`DEFAULT_REPEATERS[type]` joins the existing `DEFAULT_SHAPES` in
`defaults.ts`. Both `addRepeater` and `setRepeaterType` `structuredClone` from
it, the same guard `setShapeType` uses, so two layers never share a config
object.

`setRepeaterType` therefore discards the current tuning: radial→grid→radial
loses your radius and start angle. This matches `setShapeType`, and undo now
exists as the recovery path — which is exactly the safety net the Fill/Stroke
stash was invented to provide before there was one. Preserving same-named
fields was considered and rejected: carrying `spin` across while silently
dropping `radius` is harder to predict than losing everything.

## 6. The chain UI

`Inspector.tsx` already maps over `layer.repeaters`. The card header grows
controls; the rows below it are unchanged.

### 6.1 Per-card header

- A type `<select>` replacing the `· radial` text, styled like the Shape card's
  existing one, calling `setRepeaterType`.
- `↑` and `×` icon buttons using LayerList's `iconButton` class. `↑` calls
  `moveRepeater(index, +1)`; `×` calls `removeRepeater`, disabled at length 1.
- The count display of §7.

A `+ repeater` button sits after the last card and adds a `radial`.

Every one of these patterns already exists in the codebase. No new control is
being invented.

### 6.2 Coalesce keys

Inspector rows already build `` `repeat-${index}-${descriptor.key}` ``. That key
is *positionally* unstable once reordering exists: move a link mid-gesture and
the key follows the slot rather than the repeater. In practice a reorder is a
click, which blurs the focused slider and closes the coalesce group before the
move lands, so the window is already shut. Recorded here as a known limit
rather than defended against.

### 6.3 Card keys

Cards are currently `key={index}`, which is safe only because the list never
reorders. Once `moveRepeater` exists, React reuses the wrong card's DOM and
slider focus jumps between links.

Repeater configs have no id, so the honest fix is
`` key={`${index}-${repeater.type}`} ``. That still collides in a
`[radial, radial]` chain, but the failure mode shrinks from "wrong card" to
"identical card". Giving repeaters real ids would be cleaner and is a larger
change than this piece warrants; it is the obvious follow-up if reordering ever
feels wrong.

## 7. Per-level counts

Today every repeater card shows `perLayerCounts[layer.id]` — the layer total.
With one repeater that coincides with the card's own count, which is why it has
never been wrong. With a chain it is wrong on every card but the last.

`expandChain` already knows the answer: after each link it holds
`nodes.length`. So `EvaluationResult` gains:

```ts
perLayerLevelCounts: Record<LayerId, number[]>
```

the cumulative node count after each link. Card *i* renders
`levelCounts[i]`; for *i* > 0 it renders `a × b = c`, where `a` is the previous
level's cumulative count and `b` is `c / a`.

**Under truncation that division stops being exact.** Once a chain hits the
budget, a level's children are cut off partway and `c / a` is fractional — the
display must not print `12 × 8.33 = 100`. Card *i* shows the plain cumulative
count `c` alone whenever `c % a !== 0`, which is precisely the case where the
product no longer describes what happened. The document-wide truncation warning
already says the budget was hit; this stops the per-card display from asserting
a factorisation that is not true.

This is not cosmetic. When a chain hits the 100,000 cap, the running total is
what tells you *which* link caused it — the truncation warning currently says
only that it happened.

## 8. Data flow

```
layer.repeaters: [radial(12), grid(3×3)]

expandChain
  root (1 node)
    └─ radial.expand → 12 nodes        levelCounts[0] = 12
         └─ grid.expand ×12 → 108      levelCounts[1] = 108

inspector card 0: "12"
inspector card 1: "12 × 9 = 108"
```

## 9. Testing

This project's dominant defect is tests that pass by coincidence — eleven found
across two prior phases, five more in the undo/redo branch. Grid is unusually
prone to it, so fixture shapes are mandated here rather than left to the
implementer.

**Every grid fixture is asymmetric.** A 3×3 grid with `spacingX === spacingY`
passes against an implementation that swaps rows for columns, or x for y. Tests
use **2 rows × 3 cols, spacing 100 × 40**, so a transposition changes the
assertions.

**Centring needs 2×2 minimum.** A 1×1 grid sits at the origin whether the
implementation centres on the parent or anchors at a corner. Any centring
assertion on a single-cell fixture is worthless.

**Chain order is asserted through transforms, not counts.**
`[radial(3), grid(2×2)]` and `[grid(2×2), radial(3)]` both produce 12
instances. A test asserting only the total passes against a chain composed in
the wrong order, so the assertion must name resulting positions.

**Both-directions pairing is required** wherever a test asserts that nothing
happened:

- `removeRepeater` refuses at length 1 — paired with a test proving it *does*
  remove at length 2. Alone, the first passes against an op that never removes.
- Ops return by reference for an unknown id — paired with a test proving a
  known id returns a *new* document. Alone, the first passes against an op that
  never does anything.

**Mutation verification is required**, in both directions, on:

1. **Grid's centring offset** — remove the `-(n-1)/2` term; the 2×2 centring
   test must fail.
2. **Grid's row-major traversal** — swap the loop nesting; the 2×3 ordering
   test must fail.
3. **The by-reference return** in the four new ops — as paired above.

**Level counts use distinct numbers.** `3 × 4 = 12` rather than `3 × 3 = 9`, so
a cumulative count can never be confused with a per-level one, and neither can
be confused with the layer total.

## 10. Key decisions

| Decision | Rationale | Cost if wrong |
|---|---|---|
| Grid centred on the parent origin | Composability: a grid inside a radial surrounds each ring copy rather than hanging off it | Every chain lopsided; a sign flip to fix |
| `grid` before `path`/`recursive` | It is the type most unlike `radial`, so it exercises chaining hardest, and it fits the existing interface unchanged | Two more specs to write |
| `spin` is the only `perCopy` grid field | The others resolve against the parent, where a ramp would silently do nothing | A `~` toggle that lies |
| Ops return input by reference on no-op | The store's identity guard turns this into "no phantom undo steps" for free | Undo appears to do nothing |
| `removeRepeater` refuses at length 1 | An empty chain hides the section that would let you refill it | Recoverable only by undo |
| Type change replaces the config | Matches `setShapeType`; undo is the safety net | Lost tuning on a mis-click |
| Positional card keys, no repeater ids | Ids are a schema change disproportionate to this piece | Slider focus jumps on reorder in a same-type chain |
| Per-level counts on `EvaluationResult` | `expandChain` already computes them; anything else recomputes | One more field on the result type |

## 11. Deferred

- **The `path` repeater.** Needs a decision on what defines the path — the
  layer's own shape, a separate path config, or a preset library.
- **The `recursive` repeater.** Feeds its own output back in and is the only
  consumer of `ctx.depth`. Does not fit `expand(config, parent, limit)` as
  written; needs interface design.
- **Repeater ids**, which would make card keys and coalesce keys stable under
  reorder (§6.2, §6.3).
- **Naming a chain link** ("outer ring") for legibility in long chains.
