# Modulation UI — Design Spec

**Date:** 2026-08-30
**Status:** Approved design, pending implementation plan
**Parent spec:** `docs/superpowers/specs/2026-08-29-geometric-art-tool-design.md`
**Phase:** 2, piece A of five (see §2)

---

## 1. Purpose

Expose the modulation system that Phase 1 built and deliberately withheld.

Every numeric field in geo-art is already a `Field` — either a plain number or a
`Modulated` ramp across the repetition. `resolve()` handles both, is fully
tested, and the Aperture starter ships a modulated `spin`. Phase 1 shipped only
the `number` branch of the UI: the inspector renders no `~` toggle and no
document the app creates contains a ramp.

This is the change that turns mechanical output into designed output — hue
rotating across a ring, alpha fading outward, size easing down a spiral. It is
the highest expressive power per task in Phase 2, because the engine work is
already done and reviewed.

## 2. Where this sits in Phase 2

Phase 2 as written in the parent spec §13 is roughly 30 tasks across five
pieces that barely depend on each other. It was decomposed rather than
specified as one thing:

| | Piece | Size | Depends on |
|---|---|---|---|
| **A** | **Modulation UI** — this spec | ~7 tasks | nothing |
| B | Chains + repeater library (`grid`, `path`, `recursive`) | ~12 tasks | nothing |
| C | More shapes (star, superellipse, arc) | ~4 tasks | nothing |
| D | Performance (per-layer memoisation, stride sampling) | ~4 tasks | B |
| E | Undo/redo with drag coalescing | ~4 tasks | nothing |

Two items the parent spec lists under Phase 2 already landed in Phase 1: the
explosion guard (built better than specified — a required `limit` parameter
rather than an advisory estimate) and starter documents. One prerequisite the
whole-branch review raised, centralising evaluation, was fixed in that review's
own fix wave.

Each piece gets its own spec, plan and implementation cycle.

## 3. Scope

### In scope

- A `~` toggle on every numeric field the inspector renders.
- An inline editor for a modulated field: `base`, `to`, `curve`, `cycles`.
- A preview strip showing the values the copies will actually receive.
- An escape hatch back to a constant.
- Modulation on all four OKLCH colour channels, with a real gradient preview.

### Out of scope

- **The source picker.** See §4 — all three sources compute the identical value
  until a chain has more than one link. It arrives with piece B.
- **`level` targeting**, for the same reason.
- The `depth`, `radius` and `angle` sources, which remain unsupported by the
  engine and rejected by the schema.
- Any engine, schema or document-operation change (§5 explains why none is
  needed).
- Undo/redo, performance work, new repeaters, new shapes.

## 4. The finding that shaped this spec

**Every modulation source currently computes the same number.** For a single
radial repeater of count *n*, copy *i*:

| Source | Value |
|---|---|
| `t` | `i / (n−1)` |
| `flatIndex` | `i / (n−1)` — because `total` *is* `n` |
| `index` at the innermost level | `i / (n−1)` |

They diverge only when a chain has more than one link, where `index` + `level`
can target the ring while `flatIndex` runs across every copy. `radius` and
`angle` are no better: on a radial repeater every copy sits at the same radius,
and angle is index by another name.

So a source dropdown would today offer three options that do exactly the same
thing. Piece A therefore ships **no source picker** and always writes
`source: 'index'`. `curve` and `cycles` are unaffected — both are meaningful
with one repeater and carry most of the visual payoff.

When piece B lands, the picker and `level` are additive: the editor's layout
reserves the space (§7).

## 4a. The second finding: three repeater fields cannot vary

`radial.expand` resolves `count`, `radius` and `startAngle` against the
**parent** context, and only `spin` against the child. For the only repeater in
a chain the parent is the root context, which carries no indices, so `resolve`
returns `base` unchanged.

Verified by running the engine, each field modulated `0 → 300` across 4 copies:

| Field | Result |
|---|---|
| `count` | ramp `4 → 12` ignored; still 4 instances |
| `radius` | ramp ignored; every origin at `(0,0)`, i.e. `base` |
| `startAngle` | ramp ignored; layout identical to the constant case |
| `spin` | `local(1,0)` differs per copy — genuinely varies |

This is not a static property of those fields. In piece B a *second* repeater's
`count` resolves against the first one's child context and does vary. The rule
is: **a parent-resolved field varies only when it is not the first link in the
chain.**

`FieldDescriptor` therefore gains `perCopy`, and the `~` toggle renders only
where it is set. Piece B enables the parent-resolved fields for any repeater
after the first. Nothing on screen promises something it cannot do.

What remains modulatable in piece A: all three shape fields, all four colour
channels, and `spin` — eight fields, covering hue ramps, alpha fades, size
ramps and spin.

## 5. Why no engine, schema or ops change is needed

Phase 1's document layer is already modulation-ready, and this was verified
against the code rather than assumed:

- `setShapeField`, `setRepeaterField` and `setFillChannel` all take `value: Field`,
  not `value: number`.
- `documentSchema` validates `Modulated` for every field, including all four
  colour channels, and admits exactly the three sources the engine supports.
- `resolve()` handles both branches and is tested, including the `cycles` wrap
  and the single-copy case.
- `serialize`/`deserialize` round-trip a modulated document — the Aperture
  starter proves it.

The only signature that widens is `FieldRow`'s `onChange`, from
`(value: number) => void` to `(value: Field) => void`. The Inspector's three
call sites already pass through to setters that accept a `Field`.

## 6. Architecture

Five files, two new components and one new pure module:

```
src/ui/
  modulation.ts              NEW  pure: spread defaults + preview values
  descriptors.ts             MOD  + rampTo, preview, wraps, perCopy
  controls/
    FieldRow.tsx             MOD  onChange widens to Field; owns the ~ toggle
    ModulatorEditor.tsx      NEW  the inline editor
    RampPreview.tsx          NEW  the value strip
  Inspector.tsx              MOD  passes Field through; supplies the copy count
```

### 6.1 Descriptor-driven metadata

`FieldDescriptor` gains four optional keys:

```ts
export type FieldDescriptor = {
  key: string
  label: string
  min: number
  max: number
  step?: number
  unit?: string
  /** Where `to` lands when modulation is switched on. */
  rampTo?: number
  /** How the preview strip renders this field's values. */
  preview?: 'gradient' | 'bars'
  /** Hue wraps: 400° is a legal target even though max is 360. */
  wraps?: boolean
  /**
   * Resolved against the child context, so it varies across copies with a
   * single repeater. The `~` toggle renders only where this is set. See §4a.
   */
  perCopy?: boolean
}
```

The editor reads these and never branches on a field name. This preserves the
property the Phase 1 whole-branch review identified as the design's centrepiece
— the inspector walks descriptors generically — so piece B's `grid` repeater
gets working modulation for free.

The alternative considered and rejected was inferring everything from
`min`/`max`/`unit` (`to = base + (max − min) × 0.35`). Hue needs an exception
regardless, since its useful target is *past* `max` and only sensible because
hue wraps. Once one field needs an exception the formula is a rule plus
exceptions, which is worse than data.

### 6.2 The pure module

```ts
/** The opinionated spread: what `to` becomes when ~ is switched on. */
export function toModulated(descriptor: FieldDescriptor, base: number): Modulated

/** The values the first `count` copies will actually receive. */
export function previewValues(field: Modulated, count: number): number[]
```

Both are pure and testable without React. `toModulated` always emits
`source: 'index'`, `curve: 'linear'`, and no `cycles`.

### 6.3 Component responsibilities

| Component | Owns | Does not know about |
|---|---|---|
| `FieldRow` | the `~` toggle in both directions; the `base` control | the editor's internals |
| `ModulatorEditor` | editing an existing `Modulated` | how a field became modulated |
| `RampPreview` | rendering an array of numbers | modulation, colour models, documents |

`FieldRow` keeps ownership of both toggle directions — constant → modulated via
`toModulated`, and modulated → constant via the existing `constant` button — so
`ModulatorEditor` only ever receives a `Modulated` and its props stay honest.

## 7. The editor

### 7.1 Layout

The first line is **identical in both states**. A constant field is
`label · slider · readout · ~`. Toggling `~` leaves that line exactly as it is —
the slider now edits `base` — and expands three lines beneath it. Nothing jumps,
and there is no separate "base" control to learn.

```
  hue      ──────█────  280°   ~
   ├ to    ────────█──  400°
   ├ curve ▾ ease-out   cycles ─█────  1
   └ ██████▓▓▓▒▒░░              ⟲ constant
```

All four controls are inline. A two-tier layout with a "more" disclosure was
chosen during design, on the assumption it would hide `level`, `cycles` *and*
the source picker. With sources dropped (§4), `cycles` is the only thing left to
hide, and a disclosure guarding a single slider is worse than none. **"more"
arrives in piece B**, when there are genuinely three things behind it; the row
is four lines either way.

### 7.2 Turning modulation on

`to` opens at an opinionated distance from `base`, declared per descriptor as
`rampTo`, so something visibly happens the instant you click — which is how the
system teaches itself. This is safe because toggling off restores `base`
exactly; nothing is lost. Undo/redo does not exist yet (piece E), which makes
the reversible-by-toggle property load-bearing rather than merely convenient.

Defaults:

| Field | `rampTo` | Rationale |
|---|---|---|
| `h` (hue) | `base + 120` | A third of the wheel: clearly a sweep, still harmonious. `wraps: true`. |
| `a` (alpha) | `0` | Fading outward is the most common translucency effect. |
| `l` (lightness) | `base < 0.5 ? 1 : 0` | Ramps toward the far end, so the sweep is always visible. |
| `c` (chroma) | `0` | Desaturating across copies. |
| `spin` | `base + 360` | A full turn is the signature move. |
| `rotation` (shape) | `base + 360` | Same, applied to the shape itself. |
| `sides` | `max` | Ramping toward complexity — a triangle becoming a circle. |
| `radius`, `rx`, `ry` (shape) | `max` | Sizes sweep to their range edge. |

Repeater `count`, `radius` and `startAngle` carry no `rampTo`: they are not
`perCopy` and show no toggle (§4a).

### 7.3 Writes

Every control writes live through the setters that already exist — `to`, `curve`
and `cycles` on change, exactly as constant sliders do today. No draft state: the
canvas updates as you drag, which is the entire point of a live preview.

`~` writes `toModulated(descriptor, currentValue)`. `constant` writes
`field.base`.

### 7.4 Ranges

For a descriptor with `wraps: true`, the `to` control spans `base − 360 …
base + 360`, letting you dial a sweep of any size in either direction. The
document stores the raw value (`400`) and `colourToCss` wraps at render time —
verified in Phase 1, where `h: 400` emits `40`. Non-wrapping fields keep the
descriptor's own bounds.

### 7.5 Accessibility

Accessible names extend the existing scope convention: `repeat 1 spin` for base,
then `repeat 1 spin to`, `repeat 1 spin curve`, `repeat 1 spin cycles`. No
collisions, and the same addressing the Phase 1 tests already use. The `~`
toggle is a real button carrying `aria-pressed`.

**One parked Phase 1 bug is fixed in passing:** `FieldRow` builds DOM ids like
`field-repeat 1-radius`, containing a literal space, which HTML5 forbids. This
component is being rewritten anyway, so the scope is slugified.

## 8. The preview

### 8.1 Sampling

A layer can have hundreds of copies and the strip is about 150px, so the preview
draws at most 24 cells, evenly sampled across the real range:

```ts
const CELLS = 24

export function previewValues(field: Modulated, count: number): number[] {
  const total = Math.max(1, Math.round(count))
  const cells = Math.min(total, CELLS)
  return Array.from({ length: cells }, (_, k) => {
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

Each sampled cell resolves at its **true index against the true total**, not
renumbered 0…23. Renumbering would normalise `t` wrongly and render a
`cycles: 3` ramp as a single cycle. Even sampling preserves cycle structure as
long as the context stays honest.

`previewValues` calls the engine's own `resolve()`. It must never reimplement
the ramp maths: a preview that drifts from the engine is worse than no preview,
because it lies with confidence. §10 pins this.

### 8.2 Colour gradients

Modulating hue yields a hue per cell, but a swatch needs all four channels — the
layer's actual lightness, chroma and alpha with only hue varying. That
information lives in the Inspector, not the descriptor, so responsibility
splits three ways:

- the **descriptor** declares intent: `preview: 'gradient'`
- the **Inspector** builds a `toColour: (value: number) => string` closure from
  the layer's fill and the channel being edited
- **`RampPreview`** takes `values` plus an optional `toColour`, rendering
  swatches when given one and bars otherwise

`RampPreview` therefore stays ignorant of modulation, colour models and
documents — it is an array and a mapper, testable with hand-written numbers.

### 8.3 Count and edge cases

The count comes from `useEvaluation`'s `perLayerCounts`, so the strip reflects
the copies the layer actually has and `cycles` reads truthfully rather than
against an invented N.

- **count 0** (hidden layer, or truncated to nothing): an empty strip with the
  count beside it, not a misleading single cell.
- **count 1**: one cell at `base`, since every source returns 0 for a single copy.

## 9. Data flow

```
~ toggle ──► toModulated(descriptor, base) ──► setXField(doc, …, Modulated)
                                                        │
editor control ──► { ...field, [key]: v } ──────────────┤
                                                        ▼
                                                    Document
                                                        │
                                    useEvaluation ──────┴──► canvas
                                                        │
                       previewValues(field, perLayerCounts[id]) ──► RampPreview
```

Unchanged from Phase 1 in every respect except the type flowing through the
setters.

## 10. Testing

**The pure module carries the weight.** `modulation.ts` has no React:
`toModulated` produces each descriptor's documented spread and exceeds `max`
only where `wraps` is set; `previewValues` returns `min(count, 24)` cells,
samples at true indices, and shows three cycles for `cycles: 3`.

**The anti-drift test is the one that matters.** Build a layer, run the real
`evaluate()`, pull the actual per-copy values for a modulated field, and assert
`previewValues` agrees. This is what stops someone "optimising" the preview into
a copy of the ramp maths that then silently diverges.

**`RampPreview` is tested with hand-written arrays** — bars from `[0, 0.5, 1]`,
gradient with a stub mapper, plus the count-0 and count-1 edges. No document,
no colour model.

**`FieldRow` gets the interaction tests:** toggling on writes a `Modulated`
carrying the descriptor's `rampTo`; toggling off restores `base` exactly; the
first-line slider edits `base` and not `to`; generated ids contain no spaces.

**One Phase 1 test is replaced, not deleted.** `renders a modulated field as a
read-only chip` describes behaviour being removed. It is rewritten to assert the
editor renders, and the implementer's report must say so explicitly — a quietly
vanished test is indistinguishable from a regression.

**Mutation verification is required, not optional.** Phase 1 found sixteen plan
defects, most of them tests that passed by coincidence. These four must be shown
red against a deliberate break before the work is considered done:

1. sample renumbering in `previewValues` (kills the cycles property)
2. `toModulated` ignoring `rampTo` and using `max`
3. toggle-off returning `to` instead of `base`
4. the gradient mapper ignoring the varying channel

**What tests cannot cover.** Nobody has run this tool in a browser. Whether a
hue ramp actually *looks* right is a human judgement, and no assertion in this
suite settles it. The manual acceptance pass stays a human step.

## 11. Key decisions

| Decision | Rationale | Cost if wrong |
|---|---|---|
| No source picker in piece A | All three sources compute an identical value with one repeater (§4) | None — additive in piece B |
| `~` hidden on parent-resolved fields | They cannot vary with one repeater (§4a); a visible no-op control is a silent lie | None — additive in piece B |
| Descriptor-driven metadata | Keeps the render path generic; makes the spread explicit and testable per field | Descriptors widen by four optional keys |
| Opinionated `rampTo` | Something visible happens on toggle, which teaches the system | Reversible by toggling off, exactly |
| All four controls inline | A disclosure guarding one slider is worse than none | "more" arrives in piece B |
| Preview calls the real `resolve()` | A drifting preview lies with confidence | High — pinned by the anti-drift test |
| Live writes, no draft state | The canvas *is* the feedback loop | Many document writes per drag; coalescing is piece E |
| `RampPreview` takes numbers, not fields | Testable without a document; gradient logic stays in the Inspector, which has the data | Low |

## 12. Deferred

- **Source picker and `level` targeting** — piece B, when chains make them mean
  something.
- **Modulating `count`, `radius` and `startAngle`** — piece B, for any repeater
  after the first in a chain (§4a).
- **`depth`, `radius`, `angle` sources** — engine support first; `radius` and
  `angle` need a post-transform position that only becomes interesting with
  chains.
- **Per-instance jitter** (`Modulated.jitter`) — needs the keyed RNG, which is
  Phase 3.
- **Drag coalescing for undo** — piece E. Until then, a slider drag writes many
  documents, which is exactly what Phase 1 already does for constants.
- **A "more" disclosure** — piece B.
