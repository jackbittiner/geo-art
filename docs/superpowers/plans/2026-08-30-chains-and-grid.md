# Chained Repeaters + the Grid Repeater — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make repetition compose — a second repeater type, and the operations and UI to stack, reorder and retype a chain of them.

**Architecture:** The engine already chains: `repeaters` is `RepeaterConfig[]`, and `expandChain` already walks it composing transforms. So this adds a `grid` repeater behind the existing `Repeater<C>` interface, four pure chain ops beside the existing layer ops, per-level counts threaded out of the expansion that already computes them, and card-header controls built from patterns already in the codebase.

**Tech Stack:** Vite, React 19, TypeScript (strict), Tailwind v4, zustand 5, zod 4, Vitest 4, fast-check, jsdom + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-30-chains-and-grid-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **No change to `expand`'s signature, `evaluate()`'s structure, or `expandChain`'s algorithm.** The one permitted change is threading `levelCounts` out of `expandChain` (Task 3). If a task appears to need more, stop and report it — the plan is wrong.
- **Every op in `src/document/ops.ts` returns the input document BY REFERENCE when nothing matched.** The store's `apply` uses object identity to decide whether to record an undo entry, so a fresh-but-identical document becomes a phantom undo step: ⌘Z appears to do nothing and the Undo button greys out for no visible reason.
- **`grid` honours `limit` exactly as `radial` does:** emit `min(rows * cols, limit)`, but every child's `ctx.counts` records the FULL intended count. `expandChain` compares the two to distinguish real truncation from a count smaller than the budget.
- **`perCopy` is set only on fields resolved against the CHILD context.** For grid that is `spin` alone; `rows`, `cols`, `spacingX` and `spacingY` resolve against the parent and a ramp on them would silently do nothing.
- Fixture shapes are mandated by spec §9 and are not the implementer's choice: **2 rows × 3 cols, spacing 100 × 40** for ordering and position; **2 × 2 minimum** for centring; chain order asserted through **transforms, not counts**.
- TypeScript `strict: true`. No `any`. Comments explain *why*, not *what*. Conventional commit prefixes.
- **Verification is both `npm test` and `npm run build`, both green, both reported with captured output.**

## Baseline

`main` is at 88 commits: 37 test files, 367 tests passing, build clean. Every task must leave that green and only add to it.

## File structure

| File | Responsibility |
|---|---|
| `src/geometry/repeaters/grid.ts` | **New.** The `grid` repeater: rows × cols, centred on the parent origin, row-major. |
| `src/geometry/repeaters/types.ts` | **Modify.** Add `GridConfig`; `RepeaterConfig` becomes a union. |
| `src/geometry/repeaters/index.ts` | **Modify.** Register `grid`. |
| `src/document/schema.ts` | **Modify.** Second member of the zod discriminated union. |
| `src/document/defaults.ts` | **Modify.** `DEFAULT_REPEATERS`, and `defaultLayer` uses it. |
| `src/document/ops.ts` | **Modify.** Four chain ops, plus an identity fix to `updateLayer`. |
| `src/geometry/instance.ts` | **Modify.** `perLayerLevelCounts` on `EvaluationResult`. |
| `src/geometry/evaluate.ts` | **Modify.** Thread `levelCounts` out of `expandChain`. |
| `src/ui/descriptors.ts` | **Modify.** `REPEATER_FIELDS.grid`. |
| `src/ui/Inspector.tsx` | **Modify.** Card-header controls, `+ repeater`, per-level counts, stable-ish card keys. |

---

### Task 1: The grid repeater

**Files:**
- Create: `src/geometry/repeaters/grid.ts`, `src/geometry/repeaters/grid.test.ts`
- Modify: `src/geometry/repeaters/types.ts`, `src/geometry/repeaters/index.ts`

**Interfaces:**
- Consumes: `Repeater<C>`, `Placement`, `EvalContext`, `resolve`, `compose`, `translate`, `rotate`, `degToRad` — all existing.
- Produces:
  - `GridConfig = { type: 'grid'; rows: Field; cols: Field; spacingX: Field; spacingY: Field; spin: Field }`
  - `RepeaterConfig = RadialConfig | GridConfig`
  - `export const grid: Repeater<GridConfig>`
  - `getRepeater('grid')` returns it.

- [ ] **Step 1: Write the failing test**

`src/geometry/repeaters/grid.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { grid } from './grid'
import { getRepeater } from './index'
import { rootContext } from '../context'
import { applyPoint } from '../transform'
import type { GridConfig } from './types'

const config = (over: Partial<GridConfig> = {}): GridConfig => ({
  type: 'grid',
  rows: 2,
  cols: 3,
  spacingX: 100,
  spacingY: 40,
  spin: 0,
  ...over,
})

/** No cap: behavioural tests aren't about the explosion guard. */
const NO_LIMIT = Number.POSITIVE_INFINITY

const originsOf = (config: GridConfig, limit = NO_LIMIT) =>
  grid.expand(config, rootContext(), limit).map((p) => applyPoint(p.transform, { x: 0, y: 0 }))

describe('grid repeater', () => {
  it('produces one placement per cell', () => {
    expect(grid.expand(config(), rootContext(), NO_LIMIT)).toHaveLength(6)
  })

  it('walks cells row-major, centred on the parent origin', () => {
    // 2 rows x 3 cols at 100 x 40 spacing. Deliberately asymmetric in BOTH
    // dimensions: a 3x3 grid with equal spacing passes against an
    // implementation that swaps rows for columns, or x for y.
    // Centred, so x runs -100, 0, 100 and y runs -20, 20.
    expect(originsOf(config())).toEqual([
      { x: -100, y: -20 },
      { x: 0, y: -20 },
      { x: 100, y: -20 },
      { x: -100, y: 20 },
      { x: 0, y: 20 },
      { x: 100, y: 20 },
    ])
  })

  it('centres a 2x2 grid on the parent origin', () => {
    // 2x2 is the SMALLEST fixture where centred and corner-anchored differ:
    // a 1x1 grid sits at the origin either way, so any centring assertion on
    // one cell is worthless.
    expect(originsOf(config({ rows: 2, cols: 2, spacingX: 100, spacingY: 40 }))).toEqual([
      { x: -50, y: -20 },
      { x: 50, y: -20 },
      { x: -50, y: 20 },
      { x: 50, y: 20 },
    ])
  })

  it('gives each child a flat index, the cell count and a normalised t', () => {
    const out = grid.expand(config(), rootContext(), NO_LIMIT)
    expect(out.map((p) => p.ctx.indices[0])).toEqual([0, 1, 2, 3, 4, 5])
    expect(out[0].ctx.counts).toEqual([6])
    // t is the FLAT position, so a spin ramp sweeps the whole grid rather
    // than resetting each row: cell 3 of 6 is 3/5.
    expect(out[3].ctx.t).toBeCloseTo(0.6, 9)
  })

  it('resolves spin against the child context so it can ramp per copy', () => {
    const out = grid.expand(
      config({
        rows: 1, cols: 4, spacingX: 0, spacingY: 0,
        spin: { base: 0, to: 90, source: 'index', curve: 'linear' },
      }),
      rootContext(),
      NO_LIMIT,
    )
    // Cell 3 of 4 spins a full 90 degrees: (1,0) maps to (0,1).
    const p = applyPoint(out[3].transform, { x: 1, y: 0 })
    expect(p.x).toBeCloseTo(0, 9)
    expect(p.y).toBeCloseTo(1, 9)
  })

  it('spins each copy about its own centre, not the parent origin', () => {
    const [only] = grid.expand(
      config({ rows: 1, cols: 2, spacingX: 100, spacingY: 0, spin: 90 }),
      rootContext(),
      NO_LIMIT,
    )
    // Cell 0 of a centred 1x2 sits at (-50, 0), rotated 90 in place, so its
    // local (1,0) lands at (-50, 1). Under a transposed compose the copy's
    // own origin would swing away instead.
    const origin = applyPoint(only.transform, { x: 0, y: 0 })
    expect(origin.x).toBeCloseTo(-50, 9)
    expect(origin.y).toBeCloseTo(0, 9)
    const local = applyPoint(only.transform, { x: 1, y: 0 })
    expect(local.x).toBeCloseTo(-50, 9)
    expect(local.y).toBeCloseTo(1, 9)
  })

  it('clamps rows and columns to at least one', () => {
    expect(grid.expand(config({ rows: 0, cols: 0 }), rootContext(), NO_LIMIT)).toHaveLength(1)
  })

  it('gives a single cell t = 0 rather than NaN', () => {
    const [only] = grid.expand(config({ rows: 1, cols: 1 }), rootContext(), NO_LIMIT)
    expect(only.ctx.t).toBe(0)
  })

  it('caps emitted cells at the limit but keeps the full grid in context', () => {
    const out = grid.expand(config(), rootContext(), 4)
    expect(out).toHaveLength(4)
    // Every child still knows the grid has 6 cells, not 4 — truncation clips
    // the grid, it does not shrink and re-centre it.
    expect(out.every((p) => p.ctx.counts[0] === 6)).toBe(true)
    // Cell 3 still sits where it would in the full 2x3 grid: first column of
    // the second row. A re-centred 4-cell grid would put it elsewhere.
    const p3 = applyPoint(out[3].transform, { x: 0, y: 0 })
    expect(p3.x).toBeCloseTo(-100, 9)
    expect(p3.y).toBeCloseTo(20, 9)
  })

  it('emits zero placements when the limit is zero or negative', () => {
    expect(grid.expand(config(), rootContext(), 0)).toHaveLength(0)
    expect(grid.expand(config(), rootContext(), -5)).toHaveLength(0)
  })

  it('is reachable through the registry', () => {
    expect(getRepeater('grid')).toBe(grid)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/geometry/repeaters/grid.test.ts`
Expected: FAIL — cannot resolve `./grid`.

- [ ] **Step 3: Add the type**

In `src/geometry/repeaters/types.ts`, add after `RadialConfig`:

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

and replace the `RepeaterConfig` line:

```ts
/** Grows in Phase 2 with path, recursive, mirror, symmetry, kaleido. */
export type RepeaterConfig = RadialConfig | GridConfig
```

- [ ] **Step 4: Implement**

`src/geometry/repeaters/grid.ts`:

```ts
import type { EvalContext } from '../context'
import { resolve } from '../field'
import { compose, degToRad, rotate, translate } from '../transform'
import type { GridConfig, Placement, Repeater } from './types'

export const grid: Repeater<GridConfig> = {
  type: 'grid',

  expand(config: GridConfig, parent: EvalContext, limit: number): Placement[] {
    const rows = Math.max(1, Math.round(resolve(config.rows, parent)))
    const cols = Math.max(1, Math.round(resolve(config.cols, parent)))
    const spacingX = resolve(config.spacingX, parent)
    const spacingY = resolve(config.spacingY, parent)
    const count = rows * cols
    // Emit at most `limit` cells, but every child still carries the *full*
    // intended count (via ctx.counts and the t normalisation below) — a
    // truncated grid is the first N cells of the intended grid, correctly
    // positioned, not N cells of a smaller re-centred one.
    const emit = Math.min(count, Math.max(0, limit))

    // Centred on the parent origin. A grid dropped inside a radial then
    // surrounds each ring copy rather than hanging off to one side, which is
    // what makes the two compose into anything worth looking at.
    const originX = -((cols - 1) / 2) * spacingX
    const originY = -((rows - 1) / 2) * spacingY

    const placements: Placement[] = []
    for (let i = 0; i < emit; i++) {
      const row = Math.floor(i / cols)
      const col = i % cols
      const ctx: EvalContext = {
        ...parent,
        indices: [...parent.indices, i],
        counts: [...parent.counts, count],
        // The flat position, not the position within the row: a spin ramp
        // should sweep the whole grid rather than restart every row.
        t: count <= 1 ? 0 : i / (count - 1),
      }
      const spin = degToRad(resolve(config.spin, ctx))
      placements.push({
        transform: compose(
          translate(originX + col * spacingX, originY + row * spacingY),
          rotate(spin),
        ),
        ctx,
      })
    }
    return placements
  },
}
```

- [ ] **Step 5: Register it**

In `src/geometry/repeaters/index.ts`, import `grid`, add it to `REGISTRY`, and extend the two export lines:

```ts
import { grid } from './grid'
import { radial } from './radial'
import type { Repeater, RepeaterConfig, RepeaterType } from './types'

const REGISTRY: Record<RepeaterType, Repeater<never>> = {
  radial: radial as Repeater<never>,
  grid: grid as Repeater<never>,
}
```

```ts
export { grid, radial }
export type {
  Placement, Repeater, RepeaterConfig, RepeaterType, RadialConfig, GridConfig,
} from './types'
```

- [ ] **Step 6: Run and watch it pass**

Run: `npm test -- src/geometry/repeaters/grid.test.ts` → PASS (11 tests).
Then `npm test` and `npm run build` → both green.

`npm run build` will now fail elsewhere if anything switches exhaustively on `RepeaterType` — that is the union doing its job. Task 2 adds the schema case and Task 4 the descriptor case; if the build breaks here on `REPEATER_FIELDS` or `repeaterSchema`, note it and let Tasks 2 and 4 fix it rather than patching ahead. **If the build breaks, say so explicitly in your report** rather than reporting a clean build.

- [ ] **Step 7: Mutation-verify centring (required by spec §9)**

Break the centring so the grid anchors at a corner:

```ts
    const originX = 0
    const originY = 0
```

Run: `npm test -- src/geometry/repeaters/grid.test.ts`
Expected: FAIL on both `walks cells row-major, centred on the parent origin` and `centres a 2x2 grid on the parent origin`. Capture the output, restore, re-run green.

Then break it the other way — double the offset:

```ts
    const originX = -(cols - 1) * spacingX
    const originY = -(rows - 1) * spacingY
```

Expected: FAIL on the same two tests. Capture, restore, re-run green. **Both directions matter**: the first proves the tests notice centring at all, the second proves they pin the exact offset rather than merely "some offset applied".

- [ ] **Step 8: Mutation-verify row-major traversal (required by spec §9)**

Swap the traversal to column-major:

```ts
      const row = i % rows
      const col = Math.floor(i / rows)
```

Expected: FAIL on `walks cells row-major, centred on the parent origin` — with 2×3 the cell order genuinely differs. Capture, restore, re-run green.

Then the other direction — keep row-major but reverse the emission order:

```ts
    for (let i = emit - 1; i >= 0; i--) {
```

Expected: FAIL on the same test. Capture, restore, re-run green. A test that only counted cells would survive both of these; this pair proves it asserts order.

- [ ] **Step 9: Commit**

```bash
git add src/geometry/repeaters/grid.ts src/geometry/repeaters/grid.test.ts \
        src/geometry/repeaters/types.ts src/geometry/repeaters/index.ts
git commit -m "feat: a grid repeater, centred so it composes inside a radial"
```

---

### Task 2: Schema, defaults, and the four chain ops

**Files:**
- Modify: `src/document/schema.ts`, `src/document/defaults.ts`, `src/document/ops.ts`, `src/document/ops.test.ts`

**Interfaces:**
- Consumes: `GridConfig`, `RepeaterType`, `RepeaterConfig` from Task 1.
- Produces, in `ops.ts`:
  - `addRepeater(doc: Document, id: LayerId, type: RepeaterType): Document`
  - `removeRepeater(doc: Document, id: LayerId, index: number): Document`
  - `moveRepeater(doc: Document, id: LayerId, index: number, delta: number): Document`
  - `setRepeaterType(doc: Document, id: LayerId, index: number, type: RepeaterType): Document`
- Produces, in `defaults.ts`: `DEFAULT_REPEATERS: Record<RepeaterType, RepeaterConfig>`

**A latent bug this task must fix first.** `updateLayer` returns `{ ...doc, layers }` whenever the layer id matches — even when its callback returns the layer *unchanged*. So every guard written inside an `updateLayer` callback currently produces a brand-new document. The existing `setRepeaterField` already has this bug: an out-of-range index returns a fresh document, which under the undo/redo landed last session becomes a phantom history entry. All four new ops guard inside that callback, so the contract has to be fixed at the source rather than worked around four times.

- [ ] **Step 1: Write the failing test**

Append to `src/document/ops.test.ts`. Match the file's existing import style — it already imports from `./ops` and `./defaults`; add the four new ops, `DEFAULT_REPEATERS`, and `setRepeaterField` if not already imported.

```ts
describe('updateLayer identity', () => {
  it('returns the document by reference when the callback changes nothing', () => {
    // Guards written inside an updateLayer callback must not manufacture a
    // new document: the store records an undo entry per new document, so a
    // no-op edit would leave a phantom step that appears to do nothing.
    const doc = withLayer()
    const id = doc.layers[0].id
    expect(setRepeaterField(doc, id, 99, 'count', 5)).toBe(doc)
  })

  it('returns a new document when the callback does change something', () => {
    // Paired with the test above: on its own, that one passes against an op
    // that never changes anything at all.
    const doc = withLayer()
    const id = doc.layers[0].id
    expect(setRepeaterField(doc, id, 0, 'count', 5)).not.toBe(doc)
  })
})

describe('addRepeater', () => {
  it('appends a repeater of the requested type', () => {
    const doc = withLayer()
    const next = addRepeater(doc, doc.layers[0].id, 'grid')
    expect(next.layers[0].repeaters.map((r) => r.type)).toEqual(['radial', 'grid'])
  })

  it('deep-copies the default so two layers never share a config object', () => {
    const doc = withLayer()
    const next = addRepeater(doc, doc.layers[0].id, 'grid')
    expect(next.layers[0].repeaters[1]).not.toBe(DEFAULT_REPEATERS.grid)
    expect(next.layers[0].repeaters[1]).toEqual(DEFAULT_REPEATERS.grid)
  })

  it('returns the document by reference for an unknown layer', () => {
    const doc = withLayer()
    expect(addRepeater(doc, 'no-such-layer', 'grid')).toBe(doc)
  })
})

describe('removeRepeater', () => {
  it('removes the repeater at the index', () => {
    const base = withLayer()
    const id = base.layers[0].id
    const two = addRepeater(base, id, 'grid')
    const next = removeRepeater(two, id, 0)
    expect(next.layers[0].repeaters.map((r) => r.type)).toEqual(['grid'])
  })

  it('refuses to empty the chain, returning the document by reference', () => {
    // A layer with no repeaters renders one instance at the origin — legal,
    // but it hides the section that would let you add one back.
    const base = withLayer()
    expect(removeRepeater(base, base.layers[0].id, 0)).toBe(base)
  })

  it('returns the document by reference for an out-of-range index', () => {
    const base = withLayer()
    const id = base.layers[0].id
    const two = addRepeater(base, id, 'grid')
    expect(removeRepeater(two, id, 7)).toBe(two)
  })
})

describe('moveRepeater', () => {
  it('moves a repeater earlier in the chain', () => {
    const base = withLayer()
    const id = base.layers[0].id
    const two = addRepeater(base, id, 'grid')
    const next = moveRepeater(two, id, 1, -1)
    expect(next.layers[0].repeaters.map((r) => r.type)).toEqual(['grid', 'radial'])
  })

  it('moves a repeater later in the chain', () => {
    const base = withLayer()
    const id = base.layers[0].id
    const two = addRepeater(base, id, 'grid')
    const next = moveRepeater(two, id, 0, 1)
    expect(next.layers[0].repeaters.map((r) => r.type)).toEqual(['grid', 'radial'])
  })

  it('returns the document by reference when the move would leave the array', () => {
    const base = withLayer()
    const id = base.layers[0].id
    const two = addRepeater(base, id, 'grid')
    expect(moveRepeater(two, id, 0, -1)).toBe(two)
    expect(moveRepeater(two, id, 1, 1)).toBe(two)
  })
})

describe('setRepeaterType', () => {
  it('replaces the config with that type’s defaults', () => {
    const base = withLayer()
    const id = base.layers[0].id
    const next = setRepeaterType(base, id, 0, 'grid')
    expect(next.layers[0].repeaters[0]).toEqual(DEFAULT_REPEATERS.grid)
  })

  it('discards the previous tuning rather than carrying fields across', () => {
    // Consistent with setShapeType, and undo is the recovery path. Carrying
    // `spin` across while silently dropping `radius` is harder to predict.
    const base = withLayer()
    const id = base.layers[0].id
    const tuned = setRepeaterField(base, id, 0, 'spin', 45)
    const next = setRepeaterType(tuned, id, 0, 'grid')
    expect((next.layers[0].repeaters[0] as { spin: number }).spin).toBe(0)
  })

  it('returns the document by reference when the type is already that', () => {
    const base = withLayer()
    expect(setRepeaterType(base, base.layers[0].id, 0, 'radial')).toBe(base)
  })
})
```

`ops.test.ts` already has `const withLayer = () => addLayer(emptyDocument(), 'halo')` at the top of the file, and already imports `updateLayer` and `setRepeaterField` from `./ops`. Add the four new ops to that existing import list, and `DEFAULT_REPEATERS` to the `./defaults` one.

**`withLayer()` mints a fresh layer id on every call**, so seed once per test and reuse the result — calling it twice gives two unrelated documents whose ids do not match, and every assertion after that is meaningless.

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/document/ops.test.ts`
Expected: FAIL — the four ops and `DEFAULT_REPEATERS` do not exist, and `returns the document by reference when the callback changes nothing` fails against the current `updateLayer`.

- [ ] **Step 3: Fix `updateLayer`'s identity contract**

In `src/document/ops.ts`, replace the body of `updateLayer`:

```ts
export function updateLayer(
  doc: Document,
  id: LayerId,
  fn: (layer: Layer) => Layer,
): Document {
  const index = doc.layers.findIndex((l) => l.id === id)
  if (index === -1) return doc
  const next = fn(doc.layers[index])
  // A callback that guards and returns its input unchanged must not produce a
  // new document: `apply` records an undo entry per new document object, so
  // that would bank a step whose undo visibly does nothing.
  if (next === doc.layers[index]) return doc
  const layers = [...doc.layers]
  layers[index] = next
  return { ...doc, layers }
}
```

- [ ] **Step 4: Add the defaults**

In `src/document/defaults.ts`, import `RepeaterConfig` and `RepeaterType` from `../geometry/repeaters`, and add above `defaultLayer`:

```ts
/** The config a repeater gets when added, or when its type is changed. */
export const DEFAULT_REPEATERS: Record<RepeaterType, RepeaterConfig> = {
  radial: { type: 'radial', count: 12, radius: 180, startAngle: 0, spin: 0 },
  grid: { type: 'grid', rows: 3, cols: 3, spacingX: 120, spacingY: 120, spin: 0 },
}
```

Then change `defaultLayer`'s repeaters line to build from it, so there is one source of truth:

```ts
    repeaters: [structuredClone(DEFAULT_REPEATERS.radial)],
```

- [ ] **Step 5: Add the schema case**

In `src/document/schema.ts`, add a second member to `repeaterSchema`'s discriminated union:

```ts
  z.object({
    type: z.literal('grid'),
    rows: fieldSchema,
    cols: fieldSchema,
    spacingX: fieldSchema,
    spacingY: fieldSchema,
    spin: fieldSchema,
  }),
```

- [ ] **Step 6: Implement the four ops**

In `src/document/ops.ts`, importing `DEFAULT_REPEATERS` from `./defaults` and `RepeaterType` from `../geometry/repeaters`:

```ts
export function addRepeater(doc: Document, id: LayerId, type: RepeaterType): Document {
  return updateLayer(doc, id, (l) => ({
    ...l,
    repeaters: [...l.repeaters, structuredClone(DEFAULT_REPEATERS[type])],
  }))
}

export function removeRepeater(doc: Document, id: LayerId, index: number): Document {
  return updateLayer(doc, id, (l) => {
    // Refusing at one keeps the Repeat section on screen. A layer with no
    // repeaters renders a single instance at the origin -- legal, but the
    // only way back would be undo.
    if (l.repeaters.length <= 1) return l
    if (index < 0 || index >= l.repeaters.length) return l
    return { ...l, repeaters: l.repeaters.filter((_, i) => i !== index) }
  })
}

export function moveRepeater(doc: Document, id: LayerId, index: number, delta: number): Document {
  return updateLayer(doc, id, (l) => {
    const to = index + delta
    if (index < 0 || index >= l.repeaters.length) return l
    if (to < 0 || to >= l.repeaters.length) return l
    const repeaters = [...l.repeaters]
    const [moved] = repeaters.splice(index, 1)
    repeaters.splice(to, 0, moved)
    return { ...l, repeaters }
  })
}

export function setRepeaterType(
  doc: Document,
  id: LayerId,
  index: number,
  type: RepeaterType,
): Document {
  return updateLayer(doc, id, (l) => {
    if (index < 0 || index >= l.repeaters.length) return l
    if (l.repeaters[index].type === type) return l
    const repeaters = l.repeaters.map((r, i) =>
      i === index ? structuredClone(DEFAULT_REPEATERS[type]) : r,
    )
    return { ...l, repeaters }
  })
}
```

- [ ] **Step 7: Run and watch it pass**

Run: `npm test -- src/document/ops.test.ts` → PASS.
Then `npm test` and `npm run build` → both green. If `npm run build` still complains about `REPEATER_FIELDS` missing a `grid` key, that is Task 4's job — report it rather than patching ahead.

- [ ] **Step 8: Mutation-verify the by-reference contract (required by spec §9)**

Remove the identity check just added to `updateLayer`:

```ts
  const layers = [...doc.layers]
  layers[index] = fn(layers[index])
  return { ...doc, layers }
```

Run: `npm test -- src/document/ops.test.ts`
Expected: FAIL on `returns the document by reference when the callback changes nothing`, and on the by-reference tests of `removeRepeater`, `moveRepeater` and `setRepeaterType`. Capture, restore, re-run green.

Then the other direction — make `updateLayer` always return its input:

```ts
export function updateLayer(doc: Document, id: LayerId, fn: (layer: Layer) => Layer): Document {
  return doc
}
```

Expected: FAIL on `returns a new document when the callback does change something`, and on every positive op test. Capture, restore, re-run green. **This is the pairing that matters**: "an unknown id returns the input" passes trivially against an op that never does anything, and this branch has already shipped one test with exactly that defect.

- [ ] **Step 9: Commit**

```bash
git add src/document/schema.ts src/document/defaults.ts src/document/ops.ts src/document/ops.test.ts
git commit -m "feat: chain operations, and fix updateLayer's identity contract"
```

---

### Task 3: Per-level counts

**Files:**
- Modify: `src/geometry/instance.ts`, `src/geometry/evaluate.ts`, `src/geometry/evaluate.test.ts`

**Interfaces:**
- Consumes: `grid` (Task 1) and `DEFAULT_REPEATERS` (Task 2) for fixtures.
- Produces: `EvaluationResult.perLayerLevelCounts: Record<string, number[]>` — the cumulative node count after each link of the chain.

- [ ] **Step 1: Write the failing test**

Append to `src/geometry/evaluate.test.ts`, following the file's existing document-building style:

```ts
describe('per-level counts', () => {
  it('reports the cumulative count after each link of the chain', () => {
    // 3 and 4, not 3 and 3: distinct numbers at every level mean a cumulative
    // count can never be mistaken for a per-level one, nor either for the
    // layer total.
    const doc = emptyDocument()
    const layer = defaultLayer('halo')
    layer.repeaters = [
      { type: 'radial', count: 3, radius: 100, startAngle: 0, spin: 0 },
      { type: 'grid', rows: 2, cols: 2, spacingX: 10, spacingY: 10, spin: 0 },
    ]
    doc.layers.push(layer)

    const result = evaluate(doc)
    expect(result.perLayerLevelCounts[layer.id]).toEqual([3, 12])
    expect(result.perLayerCounts[layer.id]).toBe(12)
  })

  it('reports one entry per link even for a single-repeater chain', () => {
    const doc = emptyDocument()
    const layer = defaultLayer('halo')
    doc.layers.push(layer)
    expect(evaluate(doc).perLayerLevelCounts[layer.id]).toEqual([12])
  })

  it('gives a hidden layer an empty level list', () => {
    const doc = emptyDocument()
    const layer = defaultLayer('halo')
    layer.visible = false
    doc.layers.push(layer)
    expect(evaluate(doc).perLayerLevelCounts[layer.id]).toEqual([])
  })

  it('composes the chain in order, not merely to the right total', () => {
    // [radial(3), grid(2x2)] and [grid(2x2), radial(3)] both yield 12
    // instances, so a total-only assertion passes against a chain composed
    // backwards. Assert a position instead.
    const build = (repeaters: RepeaterConfig[]) => {
      const doc = emptyDocument()
      const layer = defaultLayer('halo')
      layer.shape = { type: 'polygon', sides: 4, radius: 1, rotation: 0 }
      layer.repeaters = repeaters
      doc.layers.push(layer)
      return evaluate(doc).layers[0].instances
    }
    const radialFirst = build([
      { type: 'radial', count: 3, radius: 100, startAngle: 0, spin: 0 },
      { type: 'grid', rows: 2, cols: 2, spacingX: 10, spacingY: 10, spin: 0 },
    ])
    const gridFirst = build([
      { type: 'grid', rows: 2, cols: 2, spacingX: 10, spacingY: 10, spin: 0 },
      { type: 'radial', count: 3, radius: 100, startAngle: 0, spin: 0 },
    ])

    expect(radialFirst).toHaveLength(12)
    expect(gridFirst).toHaveLength(12)

    // Radial first: instance 0 is the first grid cell around the first ring
    // copy, so it sits at (100, 0) + (-5, -5).
    const a = applyPoint(radialFirst[0].transform, { x: 0, y: 0 })
    expect(a.x).toBeCloseTo(95, 9)
    expect(a.y).toBeCloseTo(-5, 9)

    // Grid first: instance 0 is the first ring copy around the first grid
    // cell, so it sits at (-5, -5) + (100, 0).
    const b = applyPoint(gridFirst[0].transform, { x: 0, y: 0 })
    expect(b.x).toBeCloseTo(95, 9)
    expect(b.y).toBeCloseTo(-5, 9)

    // Those two coincide, which is exactly why a single sample proves
    // nothing. Instance 1 is where the orders diverge: radial-first steps to
    // the next grid cell (+10 in x), grid-first steps to the next ring copy.
    const a1 = applyPoint(radialFirst[1].transform, { x: 0, y: 0 })
    expect(a1.x).toBeCloseTo(105, 9)
    expect(a1.y).toBeCloseTo(-5, 9)

    const b1 = applyPoint(gridFirst[1].transform, { x: 0, y: 0 })
    expect(b1.x).toBeCloseTo(-5 + 100 * Math.cos((2 * Math.PI) / 3), 9)
    expect(b1.y).toBeCloseTo(-5 + 100 * Math.sin((2 * Math.PI) / 3), 9)
  })
})
```

Add `applyPoint` to the file's imports from `./transform` and `RepeaterConfig` from `./repeaters` if not already there.

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/geometry/evaluate.test.ts`
Expected: FAIL — `perLayerLevelCounts` is undefined.

- [ ] **Step 3: Extend the result type**

In `src/geometry/instance.ts`, add to `EvaluationResult`:

```ts
  /**
   * Cumulative instance count after each link of each layer's chain. The
   * inspector shows a link's own contribution against the running product,
   * which is what tells you *which* link blew the budget when a chain
   * truncates.
   */
  perLayerLevelCounts: Record<string, number[]>
```

- [ ] **Step 4: Thread it out of `expandChain`**

In `src/geometry/evaluate.ts`, change `expandChain`'s return type and body. The algorithm is untouched — this only records `nodes.length` after each link:

```ts
function expandChain(
  layer: Layer,
  budget: number,
): { nodes: Placement[]; truncated: boolean; levelCounts: number[] } {
  let nodes: Placement[] = [{ transform: IDENTITY, ctx: rootContext() }]
  let truncated = false
  const levelCounts: number[] = []
```

and, at the end of the `for (const config of layer.repeaters)` loop, after `nodes = next`:

```ts
    nodes = next
    levelCounts.push(nodes.length)
  }

  return { nodes, truncated, levelCounts }
}
```

Then in `evaluate`, declare the record beside the others:

```ts
  const perLayerLevelCounts: Record<string, number[]> = {}
```

set it to `[]` in the early-return branch beside `perLayerCounts[layer.id] = 0`:

```ts
      perLayerCounts[layer.id] = 0
      perLayerLevelCounts[layer.id] = []
```

set it from the expansion beside `perLayerCounts[layer.id] = instances.length`:

```ts
    perLayerCounts[layer.id] = instances.length
    perLayerLevelCounts[layer.id] = expansion.levelCounts
```

and add it to the returned object:

```ts
  return { layers, totalInstances, truncated, perLayerCounts, perLayerLevelCounts }
}
```

- [ ] **Step 5: Run and watch it pass**

Run: `npm test -- src/geometry/evaluate.test.ts` → PASS.
Then `npm test` and `npm run build` → both green. A build error about `REPEATER_FIELDS` lacking `grid` is Task 4's; report it rather than patching ahead.

- [ ] **Step 6: Commit**

```bash
git add src/geometry/instance.ts src/geometry/evaluate.ts src/geometry/evaluate.test.ts
git commit -m "feat: report the cumulative count after each link of a chain"
```

---

### Task 4: Descriptors and the chain UI

**Files:**
- Modify: `src/ui/descriptors.ts`, `src/ui/Inspector.tsx`, `src/ui/Inspector.test.tsx`

**Interfaces:**
- Consumes: `addRepeater`, `removeRepeater`, `moveRepeater`, `setRepeaterType` (Task 2); `perLayerLevelCounts` (Task 3); `RepeaterType` (Task 1).
- Produces: no new exports. `Inspector` gains chain controls.

- [ ] **Step 1: Write the failing test**

Append to `src/ui/Inspector.test.tsx`. Its `seed()` helper already resets `doc`, `selectedLayerId` and `history`, so these tests need no further isolation. Add `chainCountLabel` to the file's existing `import Inspector from './Inspector'` line as a named import: `import Inspector, { chainCountLabel } from './Inspector'`.

```tsx
describe('the repeater chain', () => {
  it('adds a repeater to the end of the chain', () => {
    render(<Inspector />)
    fireEvent.click(screen.getByTestId('add-repeater'))
    expect(screen.getByTestId('card-repeater-1')).toBeDefined()
    expect(useStore.getState().doc.layers[0].repeaters).toHaveLength(2)
  })

  it('changes a repeater’s type from its header', () => {
    render(<Inspector />)
    fireEvent.change(screen.getByLabelText('repeat 1 type'), { target: { value: 'grid' } })
    expect(useStore.getState().doc.layers[0].repeaters[0].type).toBe('grid')
    // The grid's own rows render, so the descriptor table was consulted.
    expect(screen.getByLabelText('repeat 1 rows')).toBeDefined()
  })

  it('moves a repeater earlier in the chain', () => {
    render(<Inspector />)
    fireEvent.click(screen.getByTestId('add-repeater'))
    fireEvent.change(screen.getByLabelText('repeat 2 type'), { target: { value: 'grid' } })
    fireEvent.click(screen.getByLabelText('Move repeat 2 up'))
    expect(useStore.getState().doc.layers[0].repeaters.map((r) => r.type)).toEqual([
      'grid', 'radial',
    ])
  })

  it('removes a repeater', () => {
    render(<Inspector />)
    fireEvent.click(screen.getByTestId('add-repeater'))
    fireEvent.click(screen.getByLabelText('Remove repeat 1'))
    expect(useStore.getState().doc.layers[0].repeaters).toHaveLength(1)
  })

  it('disables removal of the last repeater, but not of one of two', () => {
    // Paired: the disabled assertion alone passes against a button that is
    // always disabled.
    render(<Inspector />)
    expect(screen.getByLabelText('Remove repeat 1')).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByTestId('add-repeater'))
    expect(screen.getByLabelText('Remove repeat 1')).toHaveProperty('disabled', false)
  })

  it('shows the first link’s own count and later links as a product', () => {
    render(<Inspector />)
    fireEvent.click(screen.getByTestId('add-repeater'))
    fireEvent.change(screen.getByLabelText('repeat 2 type'), { target: { value: 'grid' } })
    // radial 12, then a 3x3 grid on each: 12 then 12 x 9 = 108.
    expect(screen.getByTestId('repeater-count-0').textContent).toBe('12')
    expect(screen.getByTestId('repeater-count-1').textContent).toBe('12 × 9 = 108')
  })
})

describe('chainCountLabel', () => {
  it('shows the bare count for the first link', () => {
    expect(chainCountLabel(1, 12, 0)).toBe('12')
  })

  it('shows a product for a later link', () => {
    expect(chainCountLabel(12, 108, 1)).toBe('12 × 9 = 108')
  })

  it('drops the product when truncation makes it inexact', () => {
    // 100 is not a multiple of 12, so no whole factorisation describes what
    // happened. Printing "12 × 8.33 = 100" would assert something false.
    expect(chainCountLabel(12, 100, 1)).toBe('100')
  })

  it('drops the product when the previous level is zero', () => {
    expect(chainCountLabel(0, 0, 1)).toBe('0')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/ui/Inspector.test.tsx`
Expected: FAIL — no `add-repeater` testid, no type select, `chainCountLabel` not exported.

- [ ] **Step 3: Add the grid descriptors**

In `src/ui/descriptors.ts`, add a `grid` key to `REPEATER_FIELDS`:

```ts
  grid: [
    // rows, cols and both spacings resolve against the parent context, so
    // with a single repeater they cannot vary: no perCopy, no toggle.
    // See spec §4a.
    { key: 'rows', label: 'rows', min: 1, max: 40, step: 1 },
    { key: 'cols', label: 'cols', min: 1, max: 40, step: 1 },
    { key: 'spacingX', label: 'spacing x', min: 0, max: 400, unit: 'px' },
    { key: 'spacingY', label: 'spacing y', min: 0, max: 400, unit: 'px' },
    {
      key: 'spin', label: 'spin', min: -360, max: 360, unit: '°',
      perCopy: true, wraps: true, rampTo: { kind: 'offset', delta: 360 },
    },
  ],
```

- [ ] **Step 4: Add the count label helper**

In `src/ui/Inspector.tsx`, above the component:

```tsx
/**
 * "12" for the first link, "12 × 9 = 108" after it.
 *
 * Under truncation the division stops being exact -- a chain cut off at the
 * budget leaves a cumulative count that is not a multiple of the level above.
 * Printing "12 × 8.33 = 100" would assert a factorisation that never
 * happened, so the bare cumulative count is the only honest thing to show.
 */
export function chainCountLabel(previous: number, cumulative: number, index: number): string {
  if (index === 0) return String(cumulative)
  if (previous <= 0 || cumulative % previous !== 0) return String(cumulative)
  return `${previous} × ${cumulative / previous} = ${cumulative}`
}
```

- [ ] **Step 5: Rebuild the repeater card**

In `src/ui/Inspector.tsx`, import the four ops from `../document/ops` and `RepeaterType` from `../geometry/repeaters`, add the icon-button class beside the existing `CARD`/`HEADING` constants (matching LayerList's):

```tsx
const ICON_BUTTON =
  'rounded px-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent'
```

then replace the whole `layer.repeaters.map(...)` block with:

```tsx
      {layer.repeaters.map((repeater, index) => {
        const record = repeater as unknown as Record<string, Field>
        const scope = `repeat ${index + 1}`
        const levels = result.perLayerLevelCounts[layer.id] ?? []
        const cumulative = levels[index] ?? 0
        const previous = index === 0 ? 1 : (levels[index - 1] ?? 0)
        return (
          // Keyed by index AND type: the list reorders now, and a bare index
          // key makes React reuse the wrong card's DOM, so slider focus jumps
          // between links. Still collides in a [radial, radial] chain, but the
          // failure shrinks from "wrong card" to "identical card". Real ids on
          // repeaters would fix it properly; that is a schema change.
          <div className={CARD} key={`${index}-${repeater.type}`} data-testid={`card-repeater-${index}`}>
            <div className={HEADING}>
              <span className="shrink-0">Repeat {index + 1}</span>
              <select
                aria-label={`${scope} type`}
                className="ml-1 rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-[11px] normal-case tracking-normal text-neutral-100"
                value={repeater.type}
                onChange={(e) =>
                  apply((d) => setRepeaterType(d, layer.id, index, e.target.value as RepeaterType))
                }
              >
                <option value="radial">radial</option>
                <option value="grid">grid</option>
              </select>
              <span
                data-testid={`repeater-count-${index}`}
                className="ml-auto shrink-0 tabular-nums normal-case tracking-normal text-neutral-600"
              >
                {chainCountLabel(previous, cumulative, index)}
              </span>
              <button
                className={ICON_BUTTON}
                aria-label={`Move ${scope} up`}
                disabled={index === 0}
                onClick={() => apply((d) => moveRepeater(d, layer.id, index, -1))}
              >
                ↑
              </button>
              <button
                className={ICON_BUTTON}
                aria-label={`Remove ${scope}`}
                disabled={layer.repeaters.length <= 1}
                onClick={() => apply((d) => removeRepeater(d, layer.id, index))}
              >
                ×
              </button>
            </div>
            {REPEATER_FIELDS[repeater.type].map((descriptor) => (
              <FieldRow
                key={descriptor.key}
                scope={scope}
                descriptor={descriptor}
                value={record[descriptor.key]}
                count={count}
                truncated={truncated}
                onChange={(v) =>
                  apply(
                    (d) => setRepeaterField(d, layer.id, index, descriptor.key, v),
                    `repeat-${index}-${descriptor.key}`,
                  )
                }
                onCommit={endCoalesce}
              />
            ))}
          </div>
        )
      })}

      <div className={CARD}>
        <button
          data-testid="add-repeater"
          className="w-full rounded border border-dashed border-neutral-700 py-1 text-neutral-500 hover:border-neutral-600 hover:text-neutral-300"
          onClick={() => apply((d) => addRepeater(d, layer.id, 'radial'))}
        >
          + repeater
        </button>
      </div>
```

- [ ] **Step 6: Run and watch it pass**

Run: `npm test -- src/ui/Inspector.test.tsx` → PASS.
Then `npm test` and `npm run build` → both green, and the build must now be clean: this is the task that completes the `RepeaterType` union's coverage.

- [ ] **Step 7: Static acceptance pass**

No headed browser is available to the implementer, so report each honestly:

1. `npm test` — all green, output pristine (no React `act(...)` warnings).
2. `npm run build` — clean.
3. `grep -n "key={index}" src/ui/Inspector.tsx` — no hits; the card key includes the type.
4. `grep -rn "perLayerCounts\[layer.id\]" src/ui/Inspector.tsx` — the only remaining use is `count`, threaded to `FieldRow`, not the card header.

**What remains for a human:** whether the header fits `Repeat 1`, a select, a count, and two buttons inside the 320px inspector pane without wrapping — the count string `12 × 9 = 108` is the widest thing there and no test can measure it. Also whether the grid's 120px default spacing looks right against the radial's 180px default radius.

- [ ] **Step 8: Commit**

```bash
git add src/ui/descriptors.ts src/ui/Inspector.tsx src/ui/Inspector.test.tsx
git commit -m "feat: build, reorder and retype a chain of repeaters"
```

---

## Self-review

**Spec coverage.** §4's `grid` type, centring, `limit`, flat `t` and `perCopy` rule → Task 1. §5.1's union → Task 1 (type) and Task 2 (schema). §5.2's four ops and the by-reference contract → Task 2. §5.3's refusal to empty the chain → Task 2. §5.4's default-replacing retype and `structuredClone` → Task 2. §6.1's header controls and `+ repeater` → Task 4. §6.2's coalesce keys → Task 4 (unchanged from the existing `repeat-${index}-${key}`, as the spec records). §6.3's card keys → Task 4. §7's per-level counts *and* the truncation fallback → Task 3 (engine) and Task 4 (`chainCountLabel`). §9's mandated fixtures → Task 1 (2×3 at 100×40, 2×2 centring), Task 3 (chain order through transforms, distinct 3/4 numbers), Task 2 (both-directions pairing). §9's three mutation targets → Task 1 steps 7-8, Task 2 step 8.

**Type consistency.** `GridConfig`'s five fields are named identically in Task 1 (type), Task 2 (`DEFAULT_REPEATERS`, zod schema) and Task 4 (descriptors): `rows`, `cols`, `spacingX`, `spacingY`, `spin`. `perLayerLevelCounts` is defined in Task 3 and read in Task 4. `chainCountLabel(previous, cumulative, index)` has one signature, used in Task 4's tests and implementation.

**Ordering constraint.** Tasks must run in order. Task 1's union widening deliberately breaks the build until Task 2 adds the schema case and Task 4 the descriptor case — Tasks 1-3 therefore say to *report* a build failure about `REPEATER_FIELDS` rather than patch ahead of themselves. Only after Task 4 is `npm run build` required to be clean.

**One thing found while writing this plan, not in the spec.** `updateLayer` returns a new document whenever the layer id matches, even when its callback returns the layer unchanged — so every guard written inside such a callback manufactures a phantom undo step. The existing `setRepeaterField` already has this bug. Task 2 fixes it at the source and pins it with a paired test, because all four new ops guard inside that callback and would otherwise each have to work around it.
