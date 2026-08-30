# Modulation UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the modulation system the engine already has — a `~` toggle on every field that can vary, an inline editor for `base`/`to`/`curve`/`cycles`, and a preview strip showing the values the copies will actually receive.

**Architecture:** Entirely `src/ui/`. A new pure module holds the two pieces of real logic (the opinionated spread, and preview values computed via the engine's own `resolve()`); `FieldDescriptor` grows four optional keys so the inspector's render path stays generic; `FieldRow` widens its `onChange` to `Field` and owns the toggle in both directions; two new presentational components render the editor and the preview strip.

**Tech Stack:** Vite, React 19, TypeScript (strict), Tailwind v4, zustand, zod 4, Vitest 4, fast-check, jsdom + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-30-modulation-ui-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **No engine, schema or document-operation change.** `setShapeField`, `setRepeaterField` and `setFillChannel` already accept `value: Field`; `documentSchema` already validates `Modulated`; `resolve()` already handles both branches. If a task appears to need one of these changed, stop and report it — it means the plan is wrong.
- **`src/ui/` may import from anywhere; nothing else imports from `src/ui/`.**
- **`previewValues` must call the engine's `resolve()`.** Never reimplement the ramp maths. A preview that drifts from the engine is worse than no preview.
- **The `~` toggle renders only where `descriptor.perCopy` is set.** `radial`'s `count`, `radius` and `startAngle` resolve against the parent context and cannot vary with a single repeater (spec §4a); a visible no-op control is a silent lie.
- **Piece A ships no source picker and no `level` control.** `toModulated` always writes `source: 'index'`.
- Colour is OKLCH `{ l, c, h, a }`, `l`/`a` in 0–1, `c` in 0–0.5, `h` in degrees and wrapping. Angles are degrees.
- TypeScript `strict: true`. No `any`. Conventional commit prefixes.
- **Verification is both `npm test` and `npm run build`, both green, both reported with captured output.**
- Property tests use `fc.integer({ min, max }).map(...)`, never `fc.double({ min, max })`.

## Baseline

`main` is at the Phase 1 merge: 30 test files, 215 tests passing, build clean. Every task must leave that green and only add to it.

## File structure

| File | Responsibility |
|---|---|
| `src/ui/modulation.ts` | **New.** Pure: `toModulated` (the spread) and `previewValues` (resolve over synthesised contexts). No React. |
| `src/ui/descriptors.ts` | **Modify.** `FieldDescriptor` gains `rampTo`, `preview`, `wraps`, `perCopy`; all existing descriptors populated. |
| `src/ui/controls/RampPreview.tsx` | **New.** Renders an array of numbers as bars, or as swatches when given a colour mapper. Knows nothing of modulation. |
| `src/ui/controls/ModulatorEditor.tsx` | **New.** Edits an existing `Modulated`: `to`, `curve`, `cycles`, preview, and the constant escape hatch. |
| `src/ui/controls/FieldRow.tsx` | **Modify.** `onChange` widens to `Field`; owns the `~` toggle in both directions; slugifies its scope. |
| `src/ui/Inspector.tsx` | **Modify.** Supplies each row's copy count and, for colour channels, the `toColour` closure. |

---

### Task 1: Descriptor metadata

**Files:**
- Modify: `src/ui/descriptors.ts`
- Test: `src/ui/descriptors.test.ts` (create)

**Interfaces:**
- Consumes: `RepeaterType`, `ShapeType` (already imported).
- Produces:
  - `type RampTarget = { kind: 'value'; value: number } | { kind: 'offset'; delta: number } | { kind: 'far' }`
  - `FieldDescriptor` gains `rampTo?: RampTarget`, `preview?: 'gradient' | 'bars'`, `wraps?: boolean`, `perCopy?: boolean`
  - `SHAPE_FIELDS`, `REPEATER_FIELDS`, `COLOUR_FIELDS` populated with the above.

`rampTo` has three forms because the spec's defaults genuinely need three: an absolute value (alpha ramps to `0`), an offset from wherever the user left the base (hue jumps `+120`, spin a full `+360`), and "the further bound" for lightness. Omitting `rampTo` means the descriptor's `max`.

- [ ] **Step 1: Write the failing test**

`src/ui/descriptors.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SHAPE_FIELDS, REPEATER_FIELDS, COLOUR_FIELDS, type FieldDescriptor } from './descriptors'

const all: FieldDescriptor[] = [
  ...Object.values(SHAPE_FIELDS).flat(),
  ...Object.values(REPEATER_FIELDS).flat(),
  ...COLOUR_FIELDS,
]

describe('descriptor modulation metadata', () => {
  it('marks every shape field as varying per copy', () => {
    for (const d of Object.values(SHAPE_FIELDS).flat()) {
      expect(d.perCopy, `${d.key} should be perCopy`).toBe(true)
    }
  })

  it('marks every colour channel as varying per copy, previewed as a gradient', () => {
    for (const d of COLOUR_FIELDS) {
      expect(d.perCopy, `${d.key} should be perCopy`).toBe(true)
      expect(d.preview, `${d.key} should preview as a gradient`).toBe('gradient')
    }
  })

  it('marks only spin as varying per copy on the radial repeater', () => {
    // count, radius and startAngle resolve against the parent context, so with
    // a single repeater they return `base` unchanged — see spec §4a.
    const perCopy = REPEATER_FIELDS.radial.filter((d) => d.perCopy).map((d) => d.key)
    expect(perCopy).toEqual(['spin'])
  })

  it('gives hue a wrapping +120 degree ramp', () => {
    const hue = COLOUR_FIELDS.find((d) => d.key === 'h')!
    expect(hue.wraps).toBe(true)
    expect(hue.rampTo).toEqual({ kind: 'offset', delta: 120 })
  })

  it('ramps alpha and chroma to zero, and lightness to whichever bound is further', () => {
    expect(COLOUR_FIELDS.find((d) => d.key === 'a')!.rampTo).toEqual({ kind: 'value', value: 0 })
    expect(COLOUR_FIELDS.find((d) => d.key === 'c')!.rampTo).toEqual({ kind: 'value', value: 0 })
    expect(COLOUR_FIELDS.find((d) => d.key === 'l')!.rampTo).toEqual({ kind: 'far' })
  })

  it('gives every rotation-like field a full turn', () => {
    const turns = all.filter((d) => d.unit === '°' && d.perCopy)
    expect(turns.length).toBeGreaterThan(0)
    for (const d of turns) {
      expect(d.rampTo, `${d.key} should ramp a full turn`).toEqual({ kind: 'offset', delta: 360 })
    }
  })

  it('never declares rampTo on a field that cannot vary', () => {
    for (const d of all.filter((x) => !x.perCopy)) {
      expect(d.rampTo, `${d.key} cannot vary, so a ramp target is misleading`).toBeUndefined()
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/ui/descriptors.test.ts`
Expected: FAIL — `perCopy` is not a property of `FieldDescriptor`, so TypeScript errors and the assertions fail.

- [ ] **Step 3: Extend the type**

In `src/ui/descriptors.ts`, replace the `FieldDescriptor` type with:

```ts
/**
 * Where `to` lands when modulation is switched on. Three forms, because the
 * useful default genuinely differs: an absolute value (alpha ramps to 0), an
 * offset from wherever the user left the base (hue jumps +120, spin a full
 * turn), and "the further bound" for lightness, where the interesting
 * direction depends on where you started. Omitted means the descriptor's max.
 */
export type RampTarget =
  | { kind: 'value'; value: number }
  | { kind: 'offset'; delta: number }
  | { kind: 'far' }

export type FieldDescriptor = {
  key: string
  label: string
  min: number
  max: number
  /**
   * Omitted means 'any' (see FieldRow): a slider that snapped to whole units
   * by default silently destroyed fractional values -- Moiré's startAngle of
   * 4.5 among them. Only descriptors that are genuinely integral (sides,
   * count) declare a step.
   */
  step?: number
  unit?: string
  /** Where `to` lands when modulation is switched on. Defaults to `max`. */
  rampTo?: RampTarget
  /** How the preview strip renders this field's values. Defaults to bars. */
  preview?: 'gradient' | 'bars'
  /** Hue wraps, so 400° is a legal target even though max is 360. */
  wraps?: boolean
  /**
   * Resolved against the child context, so the field varies across copies
   * even with a single repeater. The `~` toggle renders only where this is
   * set: radial's count, radius and startAngle resolve against the *parent*
   * context and would silently do nothing. See spec §4a.
   */
  perCopy?: boolean
}
```

- [ ] **Step 4: Populate the descriptors**

Replace the three exported constants:

```ts
export const SHAPE_FIELDS: Record<ShapeType, FieldDescriptor[]> = {
  polygon: [
    { key: 'sides', label: 'sides', min: 3, max: 60, step: 1, perCopy: true },
    { key: 'radius', label: 'radius', min: 0, max: 600, unit: 'px', perCopy: true },
    {
      key: 'rotation', label: 'rotation', min: -360, max: 360, unit: '°',
      perCopy: true, rampTo: { kind: 'offset', delta: 360 },
    },
  ],
  ellipse: [
    { key: 'rx', label: 'rx', min: 0, max: 600, unit: 'px', perCopy: true },
    { key: 'ry', label: 'ry', min: 0, max: 600, unit: 'px', perCopy: true },
    {
      key: 'rotation', label: 'rotation', min: -360, max: 360, unit: '°',
      perCopy: true, rampTo: { kind: 'offset', delta: 360 },
    },
  ],
}

export const REPEATER_FIELDS: Record<RepeaterType, FieldDescriptor[]> = {
  radial: [
    // count, radius and startAngle resolve against the parent context, so with
    // a single repeater they cannot vary: no perCopy, no toggle. See spec §4a.
    { key: 'count', label: 'count', min: 1, max: 200, step: 1 },
    { key: 'radius', label: 'radius', min: 0, max: 800, unit: 'px' },
    { key: 'startAngle', label: 'start', min: -360, max: 360, unit: '°' },
    {
      key: 'spin', label: 'spin', min: -360, max: 360, unit: '°',
      perCopy: true, rampTo: { kind: 'offset', delta: 360 },
    },
  ],
}

export const COLOUR_FIELDS: FieldDescriptor[] = [
  {
    key: 'l', label: 'lightness', min: 0, max: 1, step: 0.01,
    perCopy: true, preview: 'gradient', rampTo: { kind: 'far' },
  },
  {
    key: 'c', label: 'chroma', min: 0, max: 0.5, step: 0.005,
    perCopy: true, preview: 'gradient', rampTo: { kind: 'value', value: 0 },
  },
  {
    key: 'h', label: 'hue', min: 0, max: 360, unit: '°',
    perCopy: true, preview: 'gradient', wraps: true, rampTo: { kind: 'offset', delta: 120 },
  },
  {
    key: 'a', label: 'alpha', min: 0, max: 1, step: 0.01,
    perCopy: true, preview: 'gradient', rampTo: { kind: 'value', value: 0 },
  },
]
```

- [ ] **Step 5: Run and watch it pass**

Run: `npm test -- src/ui/descriptors.test.ts` → PASS (7 tests).
Then: `npm test` → all green, and `npm run build` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui/descriptors.ts src/ui/descriptors.test.ts
git commit -m "feat: declare modulation metadata on field descriptors"
```

---

### Task 2: `toModulated` — the opinionated spread

**Files:**
- Create: `src/ui/modulation.ts`, `src/ui/modulation.test.ts`

**Interfaces:**
- Consumes: `FieldDescriptor`, `RampTarget` from `./descriptors`; `Modulated` from `../geometry/field`.
- Produces: `toModulated(descriptor: FieldDescriptor, base: number): Modulated`.

Always emits `source: 'index'` and `curve: 'linear'`, and no `cycles` — piece A ships no source picker (spec §4).

- [ ] **Step 1: Write the failing test**

`src/ui/modulation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toModulated } from './modulation'
import { COLOUR_FIELDS, SHAPE_FIELDS, REPEATER_FIELDS, type FieldDescriptor } from './descriptors'

const colour = (key: string) => COLOUR_FIELDS.find((d) => d.key === key)!
const shape = (key: string) => SHAPE_FIELDS.polygon.find((d) => d.key === key)!

describe('toModulated', () => {
  it('always writes the only source piece A supports', () => {
    const field = toModulated(colour('h'), 280)
    expect(field.source).toBe('index')
    expect(field.curve).toBe('linear')
    expect(field.cycles).toBeUndefined()
  })

  it('keeps the current value as the base', () => {
    expect(toModulated(colour('h'), 280).base).toBe(280)
  })

  it('offsets hue by 120 degrees, past max, because hue wraps', () => {
    expect(toModulated(colour('h'), 280).to).toBe(400)
  })

  it('ramps alpha to zero', () => {
    expect(toModulated(colour('a'), 0.35).to).toBe(0)
  })

  it('ramps lightness to whichever bound is further from base', () => {
    expect(toModulated(colour('l'), 0.62).to).toBe(0)
    expect(toModulated(colour('l'), 0.2).to).toBe(1)
  })

  it('falls back to max when no target is declared', () => {
    expect(toModulated(shape('sides'), 6).to).toBe(60)
    expect(toModulated(shape('radius'), 60).to).toBe(600)
  })

  it('gives spin a full turn from wherever it started', () => {
    const spin = REPEATER_FIELDS.radial.find((d) => d.key === 'spin')!
    expect(toModulated(spin, 45).to).toBe(405)
  })

  it('is exactly reversible: base survives a round trip', () => {
    const descriptors: FieldDescriptor[] = [colour('h'), colour('a'), shape('sides')]
    for (const d of descriptors) {
      expect(toModulated(d, 12.5).base).toBe(12.5)
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/ui/modulation.test.ts`
Expected: FAIL — cannot resolve `./modulation`.

- [ ] **Step 3: Implement**

`src/ui/modulation.ts`:

```ts
import type { Modulated } from '../geometry/field'
import type { FieldDescriptor } from './descriptors'

/**
 * Where `to` lands when modulation is switched on. Something visible has to
 * happen — a ramp that opens flat teaches nothing — and this is safe because
 * toggling back off restores `base` exactly.
 */
export function toModulated(descriptor: FieldDescriptor, base: number): Modulated {
  return { base, to: rampTarget(descriptor, base), source: 'index', curve: 'linear' }
}

function rampTarget(descriptor: FieldDescriptor, base: number): number {
  const target = descriptor.rampTo ?? { kind: 'value' as const, value: descriptor.max }
  switch (target.kind) {
    case 'value':
      return target.value
    case 'offset':
      return base + target.delta
    case 'far':
      // Whichever bound is further away, so the sweep is always visible.
      return base - descriptor.min > descriptor.max - base ? descriptor.min : descriptor.max
  }
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test -- src/ui/modulation.test.ts` → PASS (8 tests).

- [ ] **Step 5: Mutation-verify (required by spec §10)**

Break `rampTarget` so it ignores the descriptor's target:

```ts
  const target = { kind: 'value' as const, value: descriptor.max }
```

Run: `npm test -- src/ui/modulation.test.ts`
Expected: FAIL on the hue, alpha, lightness and spin cases. Capture the output, then restore the line and re-run to green.

- [ ] **Step 6: Commit**

```bash
git add src/ui/modulation.ts src/ui/modulation.test.ts
git commit -m "feat: opinionated ramp targets for switching modulation on"
```

---

### Task 3: `previewValues` — and the anti-drift proof

**Files:**
- Modify: `src/ui/modulation.ts`, `src/ui/modulation.test.ts`

**Interfaces:**
- Consumes: `resolve`, `Modulated` from `../geometry/field`; `EvalContext` from `../geometry/context`.
- Produces: `previewValues(field: Modulated, count: number): number[]`, `PREVIEW_CELLS = 24`.

Each sampled cell resolves at its **true index against the true total**, not renumbered `0…23`. Renumbering would normalise `t` wrongly and render a `cycles: 3` ramp as a single cycle.

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/modulation.test.ts`:

```ts
import { previewValues, PREVIEW_CELLS } from './modulation'
import { evaluate } from '../geometry/evaluate'
import { emptyDocument, defaultLayer } from '../document/defaults'
import type { Modulated } from '../geometry/field'

const ramp = (over: Partial<Modulated> = {}): Modulated => ({
  base: 0, to: 100, source: 'index', curve: 'linear', ...over,
})

describe('previewValues', () => {
  it('returns one cell per copy when the layer is small', () => {
    expect(previewValues(ramp(), 5)).toEqual([0, 25, 50, 75, 100])
  })

  it('caps at PREVIEW_CELLS for a large layer', () => {
    expect(previewValues(ramp(), 500)).toHaveLength(PREVIEW_CELLS)
  })

  it('spans the whole ramp when sampling, ending at `to`', () => {
    const values = previewValues(ramp(), 500)
    expect(values[0]).toBeCloseTo(0, 6)
    expect(values.at(-1)).toBeCloseTo(100, 6)
  })

  it('shows three cycles for cycles: 3, even when sampled', () => {
    // A cycled ramp returns to its base each cycle. Count how many times the
    // sampled series steps downward: two resets for three cycles.
    const values = previewValues(ramp({ cycles: 3 }), 240)
    const resets = values.filter((v, i) => i > 0 && v < values[i - 1]).length
    expect(resets).toBe(2)
  })

  it('returns a single base-valued cell for one copy', () => {
    expect(previewValues(ramp({ base: 7 }), 1)).toEqual([7])
  })

  it('returns nothing for a layer with no copies', () => {
    expect(previewValues(ramp(), 0)).toEqual([])
  })

  it('agrees with what evaluate() actually produces', () => {
    // The anti-drift property: the preview must be the engine's own answer,
    // not a second implementation of the ramp maths that can diverge.
    const hue: Modulated = { base: 0, to: 240, source: 'index', curve: 'easeOut' }
    const doc = emptyDocument()
    const layer = defaultLayer('halo')
    layer.repeaters[0].count = 12
    layer.style.fill = { l: 0.6, c: 0.2, h: hue, a: 1 }
    doc.layers.push(layer)

    const actual = evaluate(doc).layers[0].instances.map((i) => i.style.fill!.h)
    expect(previewValues(hue, 12)).toEqual(actual)
  })
})
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm test -- src/ui/modulation.test.ts`
Expected: FAIL — `previewValues` is not exported.

- [ ] **Step 3: Implement**

Append to `src/ui/modulation.ts`:

```ts
import type { EvalContext } from '../geometry/context'
import { resolve } from '../geometry/field'

/** The strip is ~150px wide; more cells than this render as slivers. */
export const PREVIEW_CELLS = 24

/**
 * The values the first `count` copies will actually receive.
 *
 * Calls the engine's own `resolve()` rather than reimplementing the ramp: a
 * preview that drifts from the engine is worse than no preview, because it
 * lies with confidence. Pinned by the anti-drift test.
 */
export function previewValues(field: Modulated, count: number): number[] {
  const total = Math.max(0, Math.round(count))
  if (total === 0) return []
  const cells = Math.min(total, PREVIEW_CELLS)
  return Array.from({ length: cells }, (_, k) => {
    // Sample at the true index against the true total. Renumbering the cells
    // 0..23 would normalise `t` against the wrong denominator and collapse a
    // multi-cycle ramp into one cycle.
    const i = cells === 1 ? 0 : Math.round((k * (total - 1)) / (cells - 1))
    return resolve(field, previewContext(i, total))
  })
}

function previewContext(i: number, total: number): EvalContext {
  return {
    indices: [i],
    counts: [total],
    depth: 0,
    t: total <= 1 ? 0 : i / (total - 1),
    flatIndex: i,
    total,
  }
}
```

- [ ] **Step 4: Run and watch them pass**

Run: `npm test -- src/ui/modulation.test.ts` → PASS.
Then: `npm test` and `npm run build` → both green.

- [ ] **Step 5: Mutation-verify (required by spec §10)**

Break the sampling so cells are renumbered rather than resolved at their true index:

```ts
    const i = k
    return resolve(field, previewContext(i, cells))
```

Run: `npm test -- src/ui/modulation.test.ts`

**Corrected during execution — the original prediction here was wrong.** This
mutation does *not* fail the cycles test or the count-12 anti-drift test, and
cannot:

- With `count <= PREVIEW_CELLS`, `cells === total`, so `i === k` and
  `total === cells` already. The renumbering is a byte-for-byte no-op, which
  makes the 12-copy anti-drift test structurally incapable of observing it.
- At 240 copies the two index sequences do differ, but the cycles test counts
  *downward wraps*, and that metric is invariant under this mutation — both
  sequences wrap twice.

The mutation is only observable where sampling actually happens and the
comparison is against real values rather than a derived metric. The test that
catches it drives 200 copies through `evaluate()` and compares the full
24-element array against `previewValues`. Expect that test to FAIL. Capture the
output, restore, re-run to green.

- [ ] **Step 6: Commit**

```bash
git add src/ui/modulation.ts src/ui/modulation.test.ts
git commit -m "feat: preview a ramp using the engine's own resolve()"
```

---

### Task 4: `RampPreview`

**Files:**
- Create: `src/ui/controls/RampPreview.tsx`, `src/ui/controls/RampPreview.test.tsx`

**Interfaces:**
- Consumes: nothing from this plan's earlier tasks.
- Produces: default export `RampPreview`, props `{ values: number[]; label: string; toColour?: (value: number) => string }`.

Takes numbers and an optional mapper — it knows nothing about modulation, colour models or documents, which is what makes it testable with hand-written arrays. Bar heights scale to the values' own range so a subtle ramp is still legible.

- [ ] **Step 1: Write the failing test**

`src/ui/controls/RampPreview.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import RampPreview from './RampPreview'

describe('RampPreview', () => {
  it('renders one cell per value', () => {
    render(<RampPreview values={[0, 0.5, 1]} label="fill hue preview" />)
    expect(screen.getAllByTestId('ramp-cell')).toHaveLength(3)
  })

  it('renders swatches when given a colour mapper', () => {
    const toColour = (v: number) => `oklch(60% 0.2 ${v} / 1)`
    render(<RampPreview values={[0, 180]} label="fill hue preview" toColour={toColour} />)
    const cells = screen.getAllByTestId('ramp-cell')
    // Assert the mapper's own output via data-colour, not the style
    // attribute: jsdom re-serialises oklch() and rewrites 60% as 0.6.
    expect(cells[0].getAttribute('data-colour')).toBe('oklch(60% 0.2 0 / 1)')
    expect(cells[1].getAttribute('data-colour')).toBe('oklch(60% 0.2 180 / 1)')
    expect(cells[0].getAttribute('style')).toContain('oklch')
  })

  it('scales bar heights across the values own range', () => {
    render(<RampPreview values={[10, 20]} label="shape sides preview" />)
    const [low, high] = screen.getAllByTestId('ramp-cell')
    const heightOf = (el: HTMLElement) => Number.parseFloat(el.style.height)
    expect(heightOf(high)).toBeGreaterThan(heightOf(low))
  })

  it('renders flat bars when every value is identical', () => {
    render(<RampPreview values={[5, 5, 5]} label="shape sides preview" />)
    const heights = screen.getAllByTestId('ramp-cell').map((el) => el.style.height)
    expect(new Set(heights).size).toBe(1)
  })

  it('says so when the layer has no copies', () => {
    render(<RampPreview values={[]} label="fill hue preview" />)
    expect(screen.getByTestId('ramp-empty')).toBeDefined()
    expect(screen.queryAllByTestId('ramp-cell')).toHaveLength(0)
  })

  it('carries an accessible label', () => {
    render(<RampPreview values={[0, 1]} label="fill hue preview" />)
    expect(screen.getByLabelText('fill hue preview')).toBeDefined()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/ui/controls/RampPreview.test.tsx`
Expected: FAIL — cannot resolve `./RampPreview`.

- [ ] **Step 3: Implement**

`src/ui/controls/RampPreview.tsx`:

```tsx
type Props = {
  /** The values the copies will receive, already resolved. */
  values: number[]
  label: string
  /** Given, each cell is a swatch of this colour; omitted, cells are bars. */
  toColour?: (value: number) => string
}

/**
 * Renders resolved values as a strip. Deliberately ignorant of modulation,
 * colour models and documents — it is an array and a mapper, so it can be
 * tested with hand-written numbers.
 */
export default function RampPreview({ values, label, toColour }: Props) {
  if (values.length === 0) {
    return (
      <div data-testid="ramp-empty" aria-label={label} className="text-[10px] text-neutral-500">
        no copies
      </div>
    )
  }

  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo

  return (
    <div aria-label={label} className="flex h-4 items-end gap-px">
      {values.map((value, i) => (
        <div
          key={i}
          data-testid="ramp-cell"
          // The raw mapper output, because jsdom rewrites oklch() in `style`.
          data-colour={toColour ? toColour(value) : undefined}
          className={toColour ? 'h-full flex-1' : 'flex-1 bg-sky-500'}
          style={
            toColour
              ? { background: toColour(value) }
              : // A flat ramp still needs a visible bar, hence the 50% floor.
                { height: span === 0 ? '50%' : `${10 + (90 * (value - lo)) / span}%` }
          }
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test -- src/ui/controls/RampPreview.test.tsx` → PASS (6 tests).

- [ ] **Step 5: Mutation-verify (required by spec §10)**

Break the gradient mapper so it ignores the varying channel. **Both** places
the mapper is called must be broken — the `style` line paints the cell, but the
assertions read `data-colour`, so mutating only the style fails nothing:

```tsx
          data-colour={toColour ? toColour(values[0]) : undefined}
          ...
              ? { background: toColour(values[0]) }
```

(This recipe originally named only the `style` line. That was an oversight when
the assertions were moved to `data-colour` to sidestep jsdom's rewriting of
`oklch()` — the two changes have to move together.)

Run: `npm test -- src/ui/controls/RampPreview.test.tsx`
Expected: FAIL on `renders swatches when given a colour mapper` — the second cell's `data-colour` would read `oklch(60% 0.2 0 / 1)` instead of `oklch(60% 0.2 180 / 1)`. Capture the output, restore, re-run to green.

- [ ] **Step 6: Commit**

```bash
git add src/ui/controls/RampPreview.tsx src/ui/controls/RampPreview.test.tsx
git commit -m "feat: ramp preview strip, as bars or swatches"
```

---

### Task 5: `ModulatorEditor`

**Files:**
- Create: `src/ui/controls/ModulatorEditor.tsx`, `src/ui/controls/ModulatorEditor.test.tsx`

**Interfaces:**
- Consumes: `previewValues` from `../modulation`; `RampPreview` from `./RampPreview`; `EASINGS` from `../../geometry/easing`; `Field`, `Modulated` from `../../geometry/field`; `FieldDescriptor` from `../descriptors`.
- Produces: default export `ModulatorEditor` with props:

```ts
type Props = {
  /** Already slugified by FieldRow, e.g. "field-repeat-1-spin". */
  idPrefix: string
  /** Human-readable, e.g. "repeat 1 spin". */
  accessibleName: string
  descriptor: FieldDescriptor
  field: Modulated
  /** Copies the layer actually has, for a truthful preview. */
  count: number
  toColour?: (value: number) => string
  onChange: (value: Field) => void
}
```

It edits an existing `Modulated` and never decides how a field became one. Passing a plain number to `onChange` is how it makes the field constant again — no special prop needed, because `onChange` accepts a `Field`.

- [ ] **Step 1: Write the failing test**

`src/ui/controls/ModulatorEditor.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ModulatorEditor from './ModulatorEditor'
import { COLOUR_FIELDS, REPEATER_FIELDS } from '../descriptors'
import type { Modulated } from '../../geometry/field'

const hue = COLOUR_FIELDS.find((d) => d.key === 'h')!
const spin = REPEATER_FIELDS.radial.find((d) => d.key === 'spin')!

const field = (over: Partial<Modulated> = {}): Modulated => ({
  base: 280, to: 400, source: 'index', curve: 'linear', ...over,
})

type EditorProps = Parameters<typeof ModulatorEditor>[0]

function setup(over: Partial<EditorProps> = {}) {
  const onChange = vi.fn()
  render(
    <ModulatorEditor
      idPrefix="field-fill-h"
      accessibleName="fill hue"
      descriptor={hue}
      field={field()}
      count={12}
      onChange={onChange}
      {...over}
    />,
  )
  return { onChange }
}

describe('ModulatorEditor', () => {
  it('renders the three controls under scoped names', () => {
    setup()
    expect(screen.getByLabelText('fill hue to')).toBeDefined()
    expect(screen.getByLabelText('fill hue curve')).toBeDefined()
    expect(screen.getByLabelText('fill hue cycles')).toBeDefined()
  })

  it('edits `to` while preserving everything else', () => {
    const { onChange } = setup()
    fireEvent.change(screen.getByLabelText('fill hue to'), { target: { value: '340' } })
    expect(onChange).toHaveBeenCalledWith({
      base: 280, to: 340, source: 'index', curve: 'linear',
    })
  })

  it('edits the curve', () => {
    const { onChange } = setup()
    fireEvent.change(screen.getByLabelText('fill hue curve'), { target: { value: 'easeOut' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ curve: 'easeOut' }))
  })

  it('writes cycles above one, and omits the key at one', () => {
    const { onChange } = setup({ field: field({ cycles: 3 }) })
    fireEvent.change(screen.getByLabelText('fill hue cycles'), { target: { value: '1' } })
    expect(onChange).toHaveBeenCalledWith({
      base: 280, to: 400, source: 'index', curve: 'linear',
    })
    fireEvent.change(screen.getByLabelText('fill hue cycles'), { target: { value: '4' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ cycles: 4 }))
  })

  it('makes the field constant at its base', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'fill hue make constant' }))
    expect(onChange).toHaveBeenCalledWith(280)
  })

  it('lets a wrapping field target a full turn either side of base', () => {
    setup()
    const to = screen.getByLabelText('fill hue to') as HTMLInputElement
    expect(Number(to.min)).toBe(-80) // 280 - 360
    expect(Number(to.max)).toBe(640) // 280 + 360
  })

  it('bounds a non-wrapping field by its descriptor', () => {
    setup({ descriptor: spin, field: field({ base: 0, to: 360 }), accessibleName: 'repeat 1 spin' })
    const to = screen.getByLabelText('repeat 1 spin to') as HTMLInputElement
    expect(Number(to.min)).toBe(-360)
    expect(Number(to.max)).toBe(360)
  })

  it('previews against the layer real copy count', () => {
    setup({ count: 5 })
    expect(screen.getAllByTestId('ramp-cell')).toHaveLength(5)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/ui/controls/ModulatorEditor.test.tsx`
Expected: FAIL — cannot resolve `./ModulatorEditor`.

- [ ] **Step 3: Implement**

`src/ui/controls/ModulatorEditor.tsx`:

```tsx
import { EASINGS, type Easing } from '../../geometry/easing'
import type { Field, Modulated } from '../../geometry/field'
import type { FieldDescriptor } from '../descriptors'
import { previewValues } from '../modulation'
import RampPreview from './RampPreview'

type Props = {
  /** Already slugified by FieldRow, e.g. "field-repeat-1-spin". */
  idPrefix: string
  /** Human-readable, e.g. "repeat 1 spin". */
  accessibleName: string
  descriptor: FieldDescriptor
  field: Modulated
  /** Copies the layer actually has, so the preview and cycles read truthfully. */
  count: number
  toColour?: (value: number) => string
  onChange: (value: Field) => void
}

const ROW = 'flex items-center gap-2 py-0.5 text-[11px]'
const KEY = 'w-16 shrink-0 text-neutral-500'

export default function ModulatorEditor({
  idPrefix, accessibleName, descriptor, field, count, toColour, onChange,
}: Props) {
  // A wrapping field can target a full turn in either direction; 400° is a
  // legal hue even though max is 360, because colourToCss wraps at render.
  const toMin = descriptor.wraps ? field.base - 360 : descriptor.min
  const toMax = descriptor.wraps ? field.base + 360 : descriptor.max

  const setCycles = (cycles: number) => {
    const next: Modulated = { ...field, cycles }
    // resolve() ignores cycles of 1, so storing it would be noise in the file.
    if (cycles <= 1) delete next.cycles
    onChange(next)
  }

  return (
    <div className="ml-2 border-l border-neutral-800 pl-2">
      <div className={ROW}>
        <label className={KEY} htmlFor={`${idPrefix}-to`}>to</label>
        <input
          id={`${idPrefix}-to`}
          aria-label={`${accessibleName} to`}
          type="range"
          className="min-w-0 flex-1 accent-sky-500"
          min={toMin}
          max={toMax}
          step={descriptor.step ?? 'any'}
          value={field.to}
          onChange={(e) => onChange({ ...field, to: Number(e.target.value) })}
        />
        <span className="w-12 shrink-0 text-right tabular-nums text-neutral-300">
          {Number(field.to.toFixed(3))}
          {descriptor.unit === '°' ? '°' : ''}
        </span>
      </div>

      <div className={ROW}>
        <label className={KEY} htmlFor={`${idPrefix}-curve`}>curve</label>
        <select
          id={`${idPrefix}-curve`}
          aria-label={`${accessibleName} curve`}
          className="rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-neutral-100"
          value={field.curve}
          onChange={(e) => onChange({ ...field, curve: e.target.value as Easing })}
        >
          {EASINGS.map((easing) => (
            <option key={easing} value={easing}>{easing}</option>
          ))}
        </select>

        <label className={`${KEY} ml-auto text-right`} htmlFor={`${idPrefix}-cycles`}>cycles</label>
        <input
          id={`${idPrefix}-cycles`}
          aria-label={`${accessibleName} cycles`}
          type="range"
          className="w-16 shrink-0 accent-sky-500"
          min={1}
          max={8}
          step={1}
          value={field.cycles ?? 1}
          onChange={(e) => setCycles(Number(e.target.value))}
        />
        <span className="w-4 shrink-0 text-right tabular-nums text-neutral-300">
          {field.cycles ?? 1}
        </span>
      </div>

      <div className={ROW}>
        <RampPreview
          values={previewValues(field, count)}
          label={`${accessibleName} preview`}
          toColour={descriptor.preview === 'gradient' ? toColour : undefined}
        />
        <button
          type="button"
          aria-label={`${accessibleName} make constant`}
          title="Replace the ramp with its base value"
          className="ml-auto shrink-0 rounded border border-neutral-700 px-1 py-0.5 text-[10px] text-neutral-400 hover:bg-neutral-800"
          onClick={() => onChange(field.base)}
        >
          constant
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test -- src/ui/controls/ModulatorEditor.test.tsx` → PASS (8 tests).
Then: `npm test` and `npm run build` → both green.

- [ ] **Step 5: Commit**

```bash
git add src/ui/controls/ModulatorEditor.tsx src/ui/controls/ModulatorEditor.test.tsx
git commit -m "feat: inline editor for a modulated field"
```

---

### Task 6: `FieldRow` owns the toggle

**Files:**
- Modify: `src/ui/controls/FieldRow.tsx`
- Modify: `src/ui/Inspector.test.tsx` (one Phase 1 test is replaced — see Step 5)
- Test: `src/ui/controls/FieldRow.test.tsx` (create)

**Interfaces:**
- Consumes: `toModulated` from `../modulation`; `ModulatorEditor` from `./ModulatorEditor`; `isModulated`, `Field` from `../../geometry/field`.
- Produces: `FieldRow` with props `{ scope, descriptor, value: Field, count?, toColour?, onChange: (value: Field) => void }`.

**`count` and `toColour` are optional** so this task compiles and stays green without touching `Inspector.tsx` — Task 7 supplies real values. Until then the preview reads "no copies", which is honest rather than wrong.

- [ ] **Step 1: Write the failing test**

`src/ui/controls/FieldRow.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import FieldRow from './FieldRow'
import { COLOUR_FIELDS, REPEATER_FIELDS } from '../descriptors'
import type { Field } from '../../geometry/field'

const hue = COLOUR_FIELDS.find((d) => d.key === 'h')!
const count = REPEATER_FIELDS.radial.find((d) => d.key === 'count')!

function setup(value: Field, descriptor = hue, scope = 'fill') {
  const onChange = vi.fn()
  render(
    <FieldRow scope={scope} descriptor={descriptor} value={value} count={12} onChange={onChange} />,
  )
  return { onChange }
}

describe('FieldRow', () => {
  it('offers the toggle on a field that varies per copy', () => {
    setup(280)
    expect(screen.getByRole('button', { name: 'fill hue modulate' })).toBeDefined()
  })

  it('offers no toggle on a field that cannot vary', () => {
    // radial count resolves against the parent context: with one repeater a
    // ramp on it would silently do nothing. See spec §4a.
    setup(12, count, 'repeat 1')
    expect(screen.queryByRole('button', { name: 'repeat 1 count modulate' })).toBeNull()
  })

  it('switching on writes the descriptor ramp target', () => {
    const { onChange } = setup(280)
    fireEvent.click(screen.getByRole('button', { name: 'fill hue modulate' }))
    expect(onChange).toHaveBeenCalledWith({
      base: 280, to: 400, source: 'index', curve: 'linear',
    })
  })

  it('switching off restores base exactly, not the ramp target', () => {
    const { onChange } = setup({ base: 280, to: 400, source: 'index', curve: 'linear' })
    fireEvent.click(screen.getByRole('button', { name: 'fill hue modulate' }))
    expect(onChange).toHaveBeenCalledWith(280)
  })

  it('reports its state through aria-pressed', () => {
    setup({ base: 280, to: 400, source: 'index', curve: 'linear' })
    expect(screen.getByRole('button', { name: 'fill hue modulate' }).getAttribute('aria-pressed'))
      .toBe('true')
  })

  it('keeps the first-line slider editing base, not to', () => {
    const { onChange } = setup({ base: 280, to: 400, source: 'index', curve: 'linear' })
    fireEvent.change(screen.getByLabelText('fill hue'), { target: { value: '300' } })
    expect(onChange).toHaveBeenCalledWith({
      base: 300, to: 400, source: 'index', curve: 'linear',
    })
  })

  it('shows the editor when modulated', () => {
    setup({ base: 280, to: 400, source: 'index', curve: 'linear' })
    expect(screen.getByLabelText('fill hue to')).toBeDefined()
  })

  it('generates ids without spaces', () => {
    setup(0, REPEATER_FIELDS.radial.find((d) => d.key === 'spin')!, 'repeat 1')
    const slider = screen.getByLabelText('repeat 1 spin')
    expect(slider.id).toBe('field-repeat-1-spin')
    expect(slider.id).not.toContain(' ')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/ui/controls/FieldRow.test.tsx`
Expected: FAIL — there is no modulate button, and ids still contain a space.

- [ ] **Step 3: Rewrite `FieldRow`**

Replace `src/ui/controls/FieldRow.tsx` entirely:

```tsx
import { isModulated, type Field } from '../../geometry/field'
import type { FieldDescriptor } from '../descriptors'
import { toModulated } from '../modulation'
import ModulatorEditor from './ModulatorEditor'

type Props = {
  /**
   * Disambiguates fields that share a name across cards — a polygon and a
   * radial repeater both have "radius", and a chain has two "count" fields.
   */
  scope: string
  descriptor: FieldDescriptor
  value: Field
  /** Copies the layer actually has, for a truthful preview. */
  count?: number
  toColour?: (value: number) => string
  onChange: (value: Field) => void
}

/** HTML forbids spaces in an id; "repeat 1" has to become "repeat-1". */
const slugify = (scope: string) =>
  scope.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

export default function FieldRow({
  scope, descriptor, value, count = 0, toColour, onChange,
}: Props) {
  const idPrefix = `field-${slugify(scope)}-${descriptor.key}`
  const accessibleName = `${scope} ${descriptor.label}`
  const modulated = isModulated(value)
  const base = modulated ? value.base : value

  return (
    <div data-testid={`field-${slugify(scope)}-${descriptor.key}`}>
      <div className="flex items-center gap-2 py-0.5">
        <label className="w-20 shrink-0 text-neutral-400" htmlFor={idPrefix}>
          {descriptor.label}
        </label>
        <input
          id={idPrefix}
          aria-label={accessibleName}
          type="range"
          className="min-w-0 flex-1 accent-sky-500"
          min={descriptor.min}
          max={descriptor.max}
          // 'any', not 1: a default step of 1 snapped every fractional value
          // the schema allows -- a rotation of 4.5° became 5° the moment the
          // slider was touched. Integral fields declare step: 1 themselves.
          step={descriptor.step ?? 'any'}
          value={base}
          onChange={(e) => {
            const next = Number(e.target.value)
            onChange(modulated ? { ...value, base: next } : next)
          }}
        />
        <span className="w-12 shrink-0 text-right tabular-nums text-neutral-300">
          {Number(base.toFixed(3))}
          {descriptor.unit === '°' ? '°' : ''}
        </span>
        {descriptor.perCopy && (
          <button
            type="button"
            aria-label={`${accessibleName} modulate`}
            aria-pressed={modulated}
            title={modulated ? 'Replace the ramp with its base value' : 'Ramp this across the copies'}
            className={`shrink-0 rounded border px-1 text-[11px] ${
              modulated
                ? 'border-sky-500 bg-sky-500/20 text-sky-300'
                : 'border-neutral-700 text-neutral-500 hover:bg-neutral-800'
            }`}
            onClick={() => onChange(modulated ? value.base : toModulated(descriptor, base))}
          >
            ~
          </button>
        )}
      </div>

      {modulated && (
        <ModulatorEditor
          idPrefix={idPrefix}
          accessibleName={accessibleName}
          descriptor={descriptor}
          field={value}
          count={count}
          toColour={toColour}
          onChange={onChange}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the new test**

Run: `npm test -- src/ui/controls/FieldRow.test.tsx` → PASS (8 tests).

- [ ] **Step 5: Replace the Phase 1 chip test**

`src/ui/Inspector.test.tsx` contains `renders a modulated field as a read-only chip`, which asserts behaviour this task removes. **Replace it — do not delete it — and say so explicitly in your report.** A quietly vanished test is indistinguishable from a regression.

Replace that whole `it(...)` block with:

```tsx
  it('renders the editor for a modulated field, not a read-only chip', () => {
    const doc = useStore.getState().doc
    useStore.setState({
      doc: {
        ...doc,
        layers: [
          {
            ...doc.layers[0],
            repeaters: [
              { ...doc.layers[0].repeaters[0], spin: { base: 0, to: 360, source: 'index', curve: 'linear' } },
            ],
          },
        ],
      },
    })
    render(<Inspector />)
    expect(screen.getByLabelText('repeat 1 spin to')).toBeDefined()
    expect(screen.getByLabelText('repeat 1 spin curve')).toBeDefined()
    // The first-line slider now edits base rather than disappearing.
    expect(screen.getByLabelText('repeat 1 spin')).toBeDefined()
  })
```

Any other Inspector assertion that referenced `modulated-repeat 1-spin` must be updated the same way.

- [ ] **Step 6: Run the whole suite**

Run: `npm test` → all green. Then `npm run build` → clean.
If any other test broke, fix it and name it in your report.

- [ ] **Step 7: Mutation-verify (required by spec §10)**

Break the toggle so switching off returns the ramp target instead of the base:

```ts
            onClick={() => onChange(modulated ? value.to : toModulated(descriptor, base))}
```

Run: `npm test -- src/ui/controls/FieldRow.test.tsx`
Expected: FAIL on `switching off restores base exactly, not the ramp target`. Capture the output, restore, re-run to green.

- [ ] **Step 8: Commit**

```bash
git add src/ui/controls/FieldRow.tsx src/ui/controls/FieldRow.test.tsx src/ui/Inspector.test.tsx
git commit -m "feat: field rows toggle modulation on and off"
```

---

### Task 7: Inspector wiring

**Files:**
- Modify: `src/ui/Inspector.tsx`
- Modify: `src/ui/Inspector.test.tsx`

**Interfaces:**
- Consumes: `FieldRow` (props `{ scope, descriptor, value, count, toColour, onChange }`); `colourToCss` from `../render/colour`; `isModulated`, `Field` from `../geometry/field`; `useEvaluation`.
- Produces: nothing new — this is the last task.

Two things only the Inspector can supply: the layer's real copy count, and — for a colour channel — a `toColour` closure built from the layer's *other* three channels, since a swatch needs all four. Where a sibling channel is itself modulated, its `base` stands in.

- [ ] **Step 1: Write the failing test**

Append to `src/ui/Inspector.test.tsx`:

```tsx
  it('previews a colour ramp against the layer real copy count', () => {
    const doc = useStore.getState().doc
    useStore.setState({
      doc: {
        ...doc,
        layers: [
          {
            ...doc.layers[0],
            repeaters: [{ ...doc.layers[0].repeaters[0], count: 5 }],
            style: {
              fill: { l: 0.6, c: 0.2, h: { base: 0, to: 240, source: 'index', curve: 'linear' }, a: 1 },
            },
          },
        ],
      },
    })
    render(<Inspector />)
    expect(screen.getAllByTestId('ramp-cell')).toHaveLength(5)
  })

  it('builds hue swatches from the layer other channels', () => {
    const doc = useStore.getState().doc
    useStore.setState({
      doc: {
        ...doc,
        layers: [
          {
            ...doc.layers[0],
            repeaters: [{ ...doc.layers[0].repeaters[0], count: 2 }],
            style: {
              fill: { l: 0.6, c: 0.2, h: { base: 0, to: 240, source: 'index', curve: 'linear' }, a: 0.5 },
            },
          },
        ],
      },
    })
    render(<Inspector />)
    const cells = screen.getAllByTestId('ramp-cell')
    // Lightness, chroma and alpha come from the layer; only hue varies.
    // Read data-colour rather than style: jsdom rewrites 60% as 0.6.
    expect(cells[0].getAttribute('data-colour')).toBe('oklch(60% 0.2 0 / 0.5)')
    expect(cells[1].getAttribute('data-colour')).toBe('oklch(60% 0.2 240 / 0.5)')
  })

  it('offers no modulate toggle on the repeater fields that cannot vary', () => {
    render(<Inspector />)
    expect(screen.queryByRole('button', { name: 'repeat 1 count modulate' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'repeat 1 radius modulate' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'repeat 1 start modulate' })).toBeNull()
    expect(screen.getByRole('button', { name: 'repeat 1 spin modulate' })).toBeDefined()
  })
```

- [ ] **Step 2: Run and watch them fail**

Run: `npm test -- src/ui/Inspector.test.tsx`
Expected: FAIL — no `ramp-cell` elements, because `count` defaults to 0 and no `toColour` is supplied.

- [ ] **Step 3: Wire the Inspector**

In `src/ui/Inspector.tsx`, add the imports:

```tsx
import { isModulated, type Field } from '../geometry/field'
import { colourToCss } from '../render/colour'
```

Inside the component, after `const count = result.perLayerCounts[layer.id] ?? 0`, add:

```tsx
  // A swatch needs all four channels, but a channel's ramp only supplies its
  // own. The others come from the layer, using `base` where they are
  // themselves modulated. Only the Inspector has this, which is why
  // RampPreview takes a mapper rather than a colour.
  const channelBase = (field: Field): number => (isModulated(field) ? field.base : field)
  const fillSwatch = (channel: 'l' | 'c' | 'h' | 'a') => (value: number) => {
    const fill = layer.style.fill!
    return colourToCss({
      l: channel === 'l' ? value : channelBase(fill.l),
      c: channel === 'c' ? value : channelBase(fill.c),
      h: channel === 'h' ? value : channelBase(fill.h),
      a: channel === 'a' ? value : channelBase(fill.a),
    })
  }
```

Then pass `count` to all three `FieldRow` call sites, and `toColour` to the colour one:

```tsx
        {SHAPE_FIELDS[layer.shape.type].map((descriptor) => (
          <FieldRow
            key={descriptor.key}
            scope="shape"
            descriptor={descriptor}
            value={shapeRecord[descriptor.key]}
            count={count}
            onChange={(v) => apply((d) => setShapeField(d, layer.id, descriptor.key, v))}
          />
        ))}
```

```tsx
              <FieldRow
                key={descriptor.key}
                scope={scope}
                descriptor={descriptor}
                value={record[descriptor.key]}
                count={count}
                onChange={(v) => apply((d) => setRepeaterField(d, layer.id, index, descriptor.key, v))}
              />
```

```tsx
            <FieldRow
              key={descriptor.key}
              scope="fill"
              descriptor={descriptor}
              value={layer.style.fill![descriptor.key as 'l' | 'c' | 'h' | 'a']}
              count={count}
              toColour={fillSwatch(descriptor.key as 'l' | 'c' | 'h' | 'a')}
              onChange={(v) =>
                apply((d) => setFillChannel(d, layer.id, descriptor.key as 'l' | 'c' | 'h' | 'a', v))
              }
            />
```

- [ ] **Step 4: Run and watch them pass**

Run: `npm test -- src/ui/Inspector.test.tsx` → PASS.
Then: `npm test` and `npm run build` → both green.

- [ ] **Step 5: Mutation-verify the gradient wiring (required by spec §10)**

Break `fillSwatch` so it ignores the varying channel:

```tsx
      l: channelBase(fill.l),
      c: channelBase(fill.c),
      h: channelBase(fill.h),
      a: channelBase(fill.a),
```

Run: `npm test -- src/ui/Inspector.test.tsx`
Expected: FAIL on `builds hue swatches from the layer other channels` — the second cell would carry hue `0` rather than `240`. Capture the output, restore, re-run to green.

- [ ] **Step 6: Static acceptance pass**

No headed browser is available, so the plan's acceptance is static. Confirm and report each:

1. `npm test` — all green, output pristine (no React `act(...)` warnings).
2. `npm run build` — clean.
3. `grep -rn "fc.double(" src/` — no hits outside comments.
4. Every `id` generated by `FieldRow` is space-free (covered by its test).
5. The Aperture starter still loads and its modulated `spin` renders the editor rather than a chip.

**What remains unverified and needs a human:** whether a hue ramp actually *looks* right, whether the preview strip is legible at its real size, and whether the opinionated `rampTo` defaults feel good in practice. State this plainly in your report rather than implying the suite settles it.

- [ ] **Step 7: Commit**

```bash
git add src/ui/Inspector.tsx src/ui/Inspector.test.tsx
git commit -m "feat: wire copy counts and colour swatches into the inspector"
```

---

## Deviations from the spec

| Spec | Plan does | Reason |
|---|---|---|
| §6.1 `rampTo?: number` | `rampTo?: RampTarget`, a three-form union | A single number cannot express hue's `base + 120`, lightness's "further bound", and alpha's absolute `0`. The spec's own §7.2 table needs all three. |
| §6.3 "modulated → constant via the existing constant button" | The `~` button toggles both ways; the editor's `constant` button also does | Both call `onChange` with a number, so no extra prop is needed. Two affordances for one action is deliberate: `~` is the toggle, `constant` is the discoverable label. |
| §7.1 shows `⟲ constant` | Button reads `constant` | The glyph adds nothing next to a word. |

## Self-review

**Spec coverage.** §3 in-scope items map to tasks: the `~` toggle → 6; the inline editor → 5; the preview strip → 3, 4; the constant escape hatch → 5, 6; colour modulation with a gradient → 7. §4's no-source-picker → 2 (`toModulated` hard-writes `source: 'index'`). §4a's `perCopy` gating → 1, 6, 7. §6.1 descriptor metadata → 1. §6.2 pure module → 2, 3. §6.3 component responsibilities → 4, 5, 6. §7.2's `rampTo` table → 1, 2. §7.4 wrapping ranges → 5. §7.5 accessibility and the id slug fix → 6. §8 preview mechanism → 3, 4. §10's four required mutation verifications → Tasks 2, 3, 4/7 and 6 respectively.

**Type consistency.** `RampTarget` is defined in Task 1 and consumed in Task 2. `previewValues(field, count)` is defined in Task 3 and called in Task 5. `ModulatorEditor`'s props (`idPrefix`, `accessibleName`, `descriptor`, `field`, `count`, `toColour`, `onChange`) are defined in Task 5 and supplied in Task 6. `FieldRow`'s widened `onChange: (value: Field) => void` is introduced in Task 6 and relied on in Task 7, where the three setters already accept a `Field`.

**Ordering constraint.** Tasks must run in order: 2 and 3 share `modulation.ts`; 5 imports from 3 and 4; 6 imports from 2 and 5; 7 depends on 6's prop signature. `count` and `toColour` are optional on `FieldRow` specifically so Task 6 leaves the tree green without Task 7.
