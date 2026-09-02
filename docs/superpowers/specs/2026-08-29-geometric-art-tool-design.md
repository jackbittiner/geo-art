# geo-art — Design Spec

**Date:** 2026-08-29
**Status:** Approved design, pending implementation plan

---

## 1. Purpose

A browser-based tool for composing geometric art from repeated, modulated, translucent shapes.

It serves three overlapping goals, in this order:

1. **A tool the author actually uses** to make images worth keeping.
2. **A portfolio piece** — visually striking output, and an engine whose internals reward a knowledgeable reader.
3. **A learning vehicle** for tiling, symmetry groups, transforms and canvas rendering.

It is explicitly *not* a product for strangers. No accounts, no backend, no sharing infrastructure, no onboarding funnel. Complexity budget goes into the geometry engine, not into acquisition.

## 2. Goals and non-goals

### Goals

- Compose a piece from an ordered stack of layers, each producing many instances of one shape.
- Support four families of repetition — radial, grid/tessellation, recursive, path-distributed — under one composable abstraction, so they nest freely.
- Let any numeric parameter vary across the repetition rather than staying constant.
- Stacked translucency and blend modes as a first-class aesthetic, not an afterthought.
- Stay responsive (60fps interaction) at tens of thousands of instances.
- Export at print resolution.
- Feel approachable within a minute, while having real depth beneath.

### Non-goals

- Multi-user anything: accounts, cloud persistence, sharing, gallery, comments.
- Mobile or responsive layouts. Desktop, pointer, three panes.
- Animation or timeline. Modulation varies parameters *across copies*, not across time. (A future direction, deliberately not designed for now.)
- Freehand drawing, image import, or text.
- Boolean operations between arbitrary instances (see §7.3 for what *is* supported).

## 3. Core concepts

Four nouns carry the whole system.

| Concept | Definition |
|---|---|
| **Shape** | A parametric primitive (polygon, star, ellipse, superellipse, arc) that generates a `Path`. |
| **Repeater** | Anything that turns one placement into many. Radial, grid, path, recursive, mirror and symmetry are all instances of this one interface. |
| **Modulator** | A function of evaluation context returning a number, so any field can ramp, cycle, or jitter across the repetition. |
| **Instance** | The output currency: `{ path, transform, style }`. The renderer consumes a list of these and knows nothing else. |

The central insight: because a repeater is *just* "one placement in, many placements out", chaining them is the default behaviour of a loop rather than a feature. A grid of mandalas, a spiral of fractals and a kaleidoscope of tessellations are all the same code path.

## 4. Architecture

**The organising rule: the geometry engine never knows the UI or the canvas exists.** It is a pure function from a document to a list of drawable instances. Testability, the performance strategy, the renderer-swap story and the future Web Worker option all depend on holding this line.

```
src/
  geometry/          ← pure. no React, no DOM, no canvas.
    path.ts            Path type (subpaths of segments), bbox, transform
    shapes.ts          polygon, star, ellipse, superellipse, arc → Path
    transform.ts       Mat2D: compose, apply, invert, decompose, interpolate
    repeaters/
      types.ts         Repeater interface
      radial.ts  grid.ts  path.ts  recursive.ts  mirror.ts  symmetry.ts  kaleido.ts
    modulators/
      types.ts         Modulator interface, resolve()
      curve.ts  cycle.ts  random.ts  noise.ts
    easing.ts          linear, easeIn, easeOut, easeInOut, sine, exp, steps
    rng.ts             seeded PRNG (mulberry32) over an integer hash
    evaluate.ts        evaluate(doc, budget) → EvaluationResult   ← single entry point

  render/
    renderer.ts        Renderer interface
    canvas2d.ts        Canvas2DRenderer (the one we build)
    svg.ts             later: same interface, emits vector
    colour.ts          OKLCH → css string, with memoisation

  document/
    schema.ts          Document / Layer / Field types + zod validation
    ops.ts             pure mutations: addLayer, setField, reorder, duplicate…
    serialize.ts       to/from JSON, version field, migration chain
    starters.ts        bundled example documents

  state/
    store.ts           zustand: doc, selection, viewport, interaction
    history.ts         undo/redo with drag coalescing

  ui/
    App.tsx  LayerList.tsx  CanvasView.tsx  Inspector.tsx
    controls/          FieldRow, ModulatorEditor, ColourField, EnumField…
    descriptors.ts     FieldDescriptor lists per shape/repeater type
```

### Data flow

```
interaction → op → Document → evaluate() → Instance[] → Renderer → pixels
```

One direction, no cycles.

### Boundary rules (non-negotiable)

- `geometry/` imports nothing from `render/`, `state/`, `ui/`, or React.
- `render/` imports from `geometry/` and `document/`, never from `state/` or `ui/`.
  (Amended during Phase 1: `buildScene` and `exportPng` legitimately take a `Document`.
  Enforced by `src/render/boundaries.test.ts`.)
- `document/ops.ts` functions are pure: document in, new document out.
- `evaluate()` is the only entry point into the engine.

### The `document` ↔ `geometry` split

`document` owns *what the user configured* — serialisable, versioned, boring. `geometry` owns *what that means geometrically* — pure computation, no persistence concerns. Repeater configs live in the document as plain data; the code that turns a config into transforms lives in geometry and is looked up by `type`. Saved files therefore stay stable while the maths is still being rewritten.

## 5. Data model

### 5.1 Document

```ts
type Document = {
  version: 1
  seed: number                        // master seed; all randomness derives from it
  canvas: { width: number; height: number; background: Colour }
  layers: Layer[]                     // painter's order, [0] = bottom
  maxInstances: number                // explosion guard, default 100_000
}

type Layer = {
  id: LayerId
  name: string
  visible: boolean
  shape: ShapeConfig
  repeaters: RepeaterConfig[]         // a chain — each multiplies the last
  style: StyleConfig
  blend: BlendMode                    // normal | multiply | screen | overlay | difference | …
  opacity: number                     // whole-layer, separate from per-instance alpha
  mask?: { layerId: LayerId; mode: 'in' | 'out' }
}
```

### 5.2 Decision: every numeric field is a `Field`

```ts
type Field = number | Modulated

type Modulated = {
  base: number                        // value at t = 0
  to: number                          // value at t = 1
  source: 'index' | 'depth' | 'radius' | 'angle' | 't' | 'flatIndex'
  level?: number                      // which chain link drives it; default = innermost
  curve: Easing
  cycles?: number                     // repeat the ramp N times across the range
  jitter?: { amount: number; salt: number }
}
```

`jitter.salt` is a per-field constant folded into the RNG key described in §7.2 — it is *not* an independent random stream. Changing it re-rolls that one field's jitter while leaving every other field untouched.

Written once, this makes *every* parameter in the system vary across copies for free. `source` is what separates "intelligent" from "mechanical": `radius` and `angle` let a modulator respond to *where an instance landed*, so a grid can fade toward its corners without the grid repeater knowing anything about it.

### 5.3 Decision: colour is OKLCH, channel-wise

```ts
type Colour = { l: Field; c: Field; h: Field; a: Field }

type StyleConfig = {
  fill?: Colour
  stroke?: { colour: Colour; width: Field }
}
```

Colour needs no bespoke modulation machinery — it is four `Field`s. A hue rotation across a ring is `h: { base: 280, to: 160, source: 'index', curve: 'linear' }`.

**OKLCH rather than HSL, deliberately.** HSL hue ramps pass through a yellow-green that reads far brighter than the blues either side, so linear ramps look subtly wrong in a way that's hard to diagnose. OKLCH is perceptually uniform: a straight-line ramp looks straight. Same code, materially better output. Canvas 2D accepts `oklch()` strings natively.

### 5.4 Shapes

```ts
type ShapeConfig =
  | { type: 'polygon';      sides: Field; radius: Field; rotation: Field; cornerRadius: Field }
  | { type: 'star';         points: Field; outer: Field; inner: Field; rotation: Field }
  | { type: 'ellipse';      rx: Field; ry: Field; rotation: Field }
  | { type: 'superellipse'; rx: Field; ry: Field; n: Field; rotation: Field }
  | { type: 'arc';          radius: Field; start: Field; sweep: Field; width: Field }
```

If any shape field is modulated the path must be rebuilt per instance rather than built once and re-transformed. This is a great effect (sides morphing 3→8 across a repeat) and the one genuinely expensive modulation. `evaluate()` detects the constant case and takes the cheap path.

### 5.5 Evaluation context

```ts
type EvalContext = {
  indices: number[]     // position at each chain level, e.g. [7, 4]
  counts: number[]      // e.g. [12, 9]
  depth: number         // recursion depth, for recursive repeaters
  t: number             // normalised position at the current level
  flatIndex: number     // 0 … totalInstances
  radius: number        // distance from canvas centre, post-transform
  angle: number
  rng: Rng              // keyed by (docSeed, layerId, fieldId, flatIndex)
}
```

**Chain index semantics.** With a chain, an instance has several indices. Default: a modulator reads the **innermost** level, which matches the intuition "fade each copy". The optional `level` targets a specific link — so on a grid of mandalas, hue can ramp across the *grid* while size ramps within each *mandala*. Friendly default, escape hatch present.

### 5.6 Evaluation result

```ts
type EvaluationResult = {
  layers: { layerId: LayerId; instances: Instance[] }[]
  totalInstances: number
  truncated: boolean          // true if maxInstances was hit
  perLayerCounts: Record<LayerId, number>
}
```

Layers stay separate rather than flattened, because §8.1's `Scene` needs per-layer blend, opacity and mask. `perLayerCounts` feeds the live counts in the inspector (§5.7).

### 5.7 Explosion guard

Chains multiply, and `radial(12) → grid(5×5) → recursive(depth 4, branches 3)` is 24,300 instances from modest-looking numbers. Therefore:

- `maxInstances` lives in the document (default 100,000).
- Every repeater implements a cheap `estimate()`; evaluation stops at the cap and reports truncation in `EvaluationResult`.
- The inspector shows a live instance count in the layer header and per repeater card, turning amber near the ceiling.

The cost must be *felt while dialling*, not discovered via a frozen tab.

## 6. Repeaters

```ts
interface Repeater<C> {
  type: string
  expand(config: C, ctx: EvalContext): Placement[]
  estimate(config: C): number
}

type Placement = {
  transform: Mat2D
  index: number
  depth: number
  clip?: Path        // kaleidoscope only
}
```

Chaining is recursive: begin with one identity placement; for each repeater in the chain, expand every current placement and compose transforms.

| Type | Config | Notes |
|---|---|---|
| `radial` | count, radius, startAngle, spin | Copies on a circle. `spin` rotates each copy in place, independent of its position. Mirroring is *not* a radial option — chain `radial → mirror` instead, so there is exactly one way to express reflection. |
| `grid` | cols, rows, gapX, gapY, stagger, skew | `stagger` gives brick/hex offsets; `skew` gives rhombic lattices. |
| `path` | curve (spiral/bezier/sine), count, align, spread | `align` rotates each copy to the curve tangent. |
| `recursive` | depth, branches, scale, rotate, translate | Returns a flattened tree; each placement carries its `depth`. |
| `mirror` | axis, offset | Reflection matrix; doubles the set. |
| `symmetry` | group, cellSize, cols, rows | The 17 wallpaper groups. |
| `kaleido` | wedges, mirror | Clips the source to a wedge and reflects outward. |

**`symmetry` is affordable** because a wallpaper group has a compact formulation: *two lattice vectors plus a finite set of transforms within the unit cell*. The whole feature is a 17-entry lookup table consumed by the same expand loop as everything else. Highest ratio of mathematical substance to lines of code in the project.

**`kaleido` does not depend on boolean ops.** `Placement.clip` carries a wedge path and the renderer does `save() → clip() → draw → restore()`. Free, correct, and it decouples kaleidoscope from the Phase 4 boolean work entirely.

## 7. Modulators, randomness, and booleans

### 7.1 Resolution

```ts
interface Modulator { sample(config: ModulatorConfig, ctx: EvalContext): number }
resolve(field: Field, ctx: EvalContext): number
```

`resolve()` runs for every field of every instance and is the hottest function in the codebase. It takes a fast path when `typeof field === 'number'`, which is the common case.

### 7.2 Randomness must be keyed, not sequential

Every random draw is `hash(docSeed, layerId, fieldId, flatIndex) → value`, never a running stream.
(Scoped to draws made *during evaluation*. `randomLayer` — the empty state's "Start random" — is
an authoring-time roll: it runs a sequential stream once, freezes the result into the document, and
is never re-sampled, so there is nothing downstream for it to reshuffle.)

With a sequential stream, adding a layer or bumping a count reshuffles the randomness of everything downstream — nudge one slider and a composition you spent twenty minutes on rearranges itself. Keyed hashing means layer 3's jitter is stable regardless of what happens to layers 1, 2 and 4, and re-rolling means deliberately changing `docSeed`. One-line implementation difference; enormous difference in whether the tool is trustworthy.

Noise is a small simplex implementation seeded identically.

### 7.3 Booleans, at the edges only

True path booleans across all instances are catastrophic — the maths on thousands of paths per frame drops the tool to single-digit fps. They are supported in the two places they are cheap:

- **Before repetition, on the source shape.** Subtract a circle from a hexagon *once*, then repeat the result. One operation, not thousands. This is where most interesting form-making lives: you design a motif, then tile it.
- **Between layers, as compositing.** Layer B clipped to layer A's silhouette is `globalCompositeOperation = 'destination-in'` on an offscreen canvas — a GPU-accelerated pixel operation, and visually indistinguishable from a true intersect for this purpose.

**Explicitly unsupported:** booleans between arbitrary instances (instance #7 of a radial against instance #12 of a grid). If that ever becomes necessary it is a re-architecture toward a path-algebra core, and a separate conversation.

## 8. Rendering and performance

### 8.1 Interface

```ts
interface Renderer {
  resize(w: number, h: number, dpr: number): void
  draw(scene: Scene, viewport: Viewport): void
}

type Scene = {
  background: Colour
  layers: { instances: Instance[]; blend: BlendMode; opacity: number; mask?: Mask }[]
}
```

The scene keeps layers **separate** rather than flattening to one instance list, because blend mode, layer opacity and masking are per-layer operations requiring an offscreen buffer.

### 8.2 Canvas 2D — why, not WebGL

The aesthetic rests on stacked translucent shapes, so the deciding criteria are edge anti-aliasing and alpha compositing quality. Canvas 2D provides a production-grade path rasteriser: analytic anti-aliasing, correct stroke joins/caps/dashes, and the full set of named blend modes. WebGL hands you triangles — arbitrary path fills require self-written triangulation, proper stroking is a hard sub-project, and MSAA is coarser than analytic coverage. The WebGL version would take weeks longer and look *worse*.

Tens of thousands of filled paths per frame is routine for Canvas 2D, which is comfortably beyond the working range.

SVG/DOM is rejected: it dies around 3–5k nodes (which recursive repeaters exceed trivially), and its one advantage — free per-node hit-testing — is worthless here, because manipulation targets the *layer*, not the instance.

### 8.3 Draw loop

Per layer: if plain (`normal` blend, opacity 1, no mask), draw directly to the main canvas; otherwise draw to a **pooled** offscreen canvas and composite in one `drawImage`. Pooling is required — allocating a 4K offscreen per layer per frame is the fastest route to a stuttering tool.

Per instance: `setTransform(composed)` then `fill(path2d)`, reusing the *same* `Path2D` across all instances of a layer.

### 8.4 The four techniques that buy 60fps

1. **Path2D caching** — one path per unique shape config, not per instance. Bypassed only when a shape field is modulated; `evaluate()` flags this.
2. **Per-layer memoised evaluation** — cached by layer identity. Pure ops return new documents, so unchanged layers are reference-equal and the check is `===`, not a deep compare.
3. **Stride sampling during interaction** — while dragging, render every *k*th instance, never the first *k*. Drawing the first 2,000 of 20,000 shows a quarter-finished picture that changes shape as you drag; every 10th shows the whole composition at lower density, so what you steer is what you get. Full quality on pointer-up. Optionally drop to 1× DPR mid-drag.
4. **Colour string memoisation** — 50,000 `oklch(…)` template strings per frame is real garbage pressure. Unmodulated colour → one string per layer. Modulated → quantise channels and memoise in a `Map`; 50,000 instances rarely need more than a few hundred distinct colours.

Plus rAF coalescing behind a dirty flag: no state change triggers more than one render per frame.

**Deliberately not built until profiling demands it:** draw-call batching by style; moving `evaluate()` into a Web Worker. The worker option stays open precisely because geometry is pure.

### 8.5 High-DPI

Backing store is CSS size × `devicePixelRatio`, with the transform scaled to match.

## 9. Export and persistence

- **PNG** — the same renderer against an offscreen canvas at N× scale. Because `Renderer.draw` already takes explicit dimensions and a viewport, there is no second code path to keep in sync, and 4× print export is free. Export always uses the document's canvas dimensions, independent of view pan/zoom.
- **SVG** (later phase) — same `Scene` in, `<path>` elements out; blend modes map to `mix-blend-mode`, masks to `<clipPath>`. This is the route to genuine print-quality vector output.
- **Documents** — JSON with `version` and a migration chain. Kilobytes, since it is config rather than pixels: trivially diffable, and exactly reproducible via the seed. Autosave to localStorage plus explicit file download/upload. No backend.

## 10. UI

### 10.1 Shell

```
┌ doc name · 1200×1200 · seed 8814 ⟳ · undo/redo · Export ▾ ──────────────────┐
├──────────┬──────────────────────────────────────┬───────────────────────────┤
│ LAYERS   │            CANVAS                    │  INSPECTOR                │
│ ~200px   │            flex, pan/zoom            │  ~320px                   │
└──────────┴──────────────────────────────────────┴───────────────────────────┘
```

Desktop only. The seed sits in the top bar beside a re-roll button — with keyed randomness that button is the "surprise me" affordance and deserves permanence.

### 10.2 Inspector: stacked cards (layout A)

Shape, every repeater in the chain, and style are all visible in one scrolling column. Nesting is shown by an indent bar on chained repeaters. Cards are collapsible. Each card header carries its multiplier and running instance total.

Every numeric field row is: label · slider · number box · `~` toggle. The `~` toggle converts a constant into a `Modulated` and expands a ramp editor inline beneath the row (base → to, source, curve, cycles, and a gradient/sparkline preview).

### 10.3 The decision that matters: schema-driven rendering

Each shape and repeater type declares its fields as data:

```ts
const radialFields: FieldDescriptor[] = [
  { key: 'count',  label: 'count',  min: 1,    max: 200, step: 1 },
  { key: 'radius', label: 'radius', min: 0,    max: 800, unit: 'px' },
  { key: 'spin',   label: 'spin',   min: -360, max: 360, unit: '°' },
]
```

The inspector renders cards by walking these descriptors; a single `<FieldRow>` handles the entire constant-vs-modulated interaction.

**Adding a new repeater type is therefore three things — a config type, an `expand()`, and a field list — and the UI appears for free.** This is what stops UI work scaling linearly with engine work, and what keeps every control in the app consistent by construction.

`<FieldRow>` is the most important component in the codebase: drag-on-label to adjust, shift for coarse, double-click to type, and a `~` toggle that converts `5` into `{ base: 5, to: 5, … }` without the displayed value jumping.

### 10.4 State

Zustand, four slices: `doc`, `selection`, `viewport`, `interaction`.

Undo/redo is a stack of documents (pure ops make this trivial) with one required refinement: **drag coalescing**. Ops carry a coalesce key; consecutive ops with the same key on the same field collapse into one history entry. History records "you dragged radius", not ninety-nine one-pixel moves.

`interaction.isDragging` drives the renderer's stride-sampled preview mode, so §8.4's performance strategy hangs off a boolean the UI already tracks.

### 10.5 Canvas interaction

Wheel zooms at cursor; space-drag or middle-drag pans; `F` fits. Selection is primarily via the layer list. Click-to-select on canvas is a later nicety (bounding-box test, cheapest-first) and is genuinely optional, since a layer's 3,000 copies are one thing conceptually.

Keyboard: `⌘Z` / `⇧⌘Z`, `⌘D` duplicate layer, `⌫` delete, `R` re-roll seed, `space` pan, `F` fit.

### 10.6 Starters

Half a dozen example documents bundled as JSON and offered on an empty canvas. Cheap, and they do double duty: nobody's first experience should be a blank grid and eleven sliders, and they are the portfolio screenshots.

## 11. Testing

Vitest. The pure core means the interesting logic needs no DOM, canvas or React.

**Unit** — transform algebra (compose/invert round-trip, associativity), shape generators (vertex count, closure, bbox), easing curves, PRNG.

**Repeaters** — each `expand()` tested for count and for first/last placement position, plus chain composition (`radial(12) → grid(3×3)` = 108 placements at hand-computable positions). Geometry is a domain where expected outputs are calculable by hand, making it close to ideal for TDD.

**Property-based (fast-check)** — the domain has real invariants, so these earn their keep more than in typical app code:

- mirror about an axis, applied twice, is identity
- every instance of `radial(n, r)` sits at distance `r` from the centre
- `symmetry(group)` output is invariant under that group's own generators — a strong test of the wallpaper table
- any document survives a JSON round-trip unchanged

**The keyed-RNG stability test**, written early and never deleted: evaluate a document, insert an unrelated layer, re-evaluate, assert the original layer's instances are bit-identical.

**Renderer** — thin by design, tested via a `FakeRenderer` recording calls, not pixels. Asserts that plain layers draw direct while `multiply` layers route through an offscreen buffer, that one `Path2D` is reused across instances, and that stride sampling selects every *k*th. No pixel diffing; that tests the browser's rasteriser, not this code.

**Visual regression** — snapshot the **instance list** (coordinates rounded to 3dp) per starter document, not the image. Deterministic, readable in a diff, runs in milliseconds. Playwright screenshots against the starters can come later if the renderer ever needs a safety net; not in the initial build.

**Performance** — a benchmark script over fixtures at 1k / 10k / 50k instances asserting `evaluate()` time budgets, to catch an accidental O(n²) the day it lands.

## 12. Stack

- **Vite + React 19 + TypeScript.** Vite rather than Next.js: this is a purely client-side tool with no routing, no SSR and no server needs, and Vite's HMR is a materially better fit for tight visual iteration. (Next.js would work; it would just be carrying weight for nothing.)
- **Tailwind** for UI styling.
- **Zustand** for state.
- **Vitest** + **fast-check** for tests.
- No canvas/geometry libraries in the core — writing the transforms and shape maths is a stated goal of the project.
- A path-boolean library (Paper.js or `polygon-clipping`) enters only at Phase 4, and only for source-shape operations.

## 13. Implementation phases

**Phase 1 — end-to-end and pretty.**
Document schema, `evaluate()`, polygon + ellipse shapes, `radial` repeater, OKLCH style with alpha, Canvas2D renderer, three-pane shell, layer list, stacked-card inspector, PNG export, save/load. Ships something genuinely nice to look at.

The `Field` type and `resolve()` exist from the first commit — the pervasiveness noted in §14 is exactly why they cannot be retrofitted — but Phase 1 ships only the `number` branch: `resolve()` handles `Modulated` and is tested, while the inspector renders no `~` toggle and no document produces one. Phase 2 turns on the UI, not the types.

**Phase 2 — depth in repetition.**
Chained repeaters with nesting UI, `grid`, `path` and `recursive` types, star/superellipse/arc shapes, the full `Field`/`Modulated` system and `ModulatorEditor`, per-layer memoisation, stride sampling, explosion guard, undo/redo with coalescing.

**Phase 3 — symmetry and generation.**
`mirror`, `symmetry` (17 wallpaper groups), `kaleido` with clip placements, keyed RNG and noise modulators, seed UI and re-roll, starter documents, blend modes and layer masking via compositing.

**Phase 4 — construction and output.**
Source-shape booleans (union/subtract/intersect/offset), SVG vector export, canvas click-to-select, benchmark suite hardening.

Each phase is independently useful and independently shippable.

## 14. Key decisions and rationale

| Decision | Rationale | Cost if wrong |
|---|---|---|
| Instance pipeline, not path-algebra core | Fastest route to pleasing output; booleans handled where they are cheap | Instance-level booleans would need re-architecture |
| Canvas 2D, not WebGL or SVG | Best anti-aliasing and alpha compositing; blend modes free; ample headroom | Renderer interface makes a WebGL backend an additive change |
| Every numeric field is a `Field` | One concept gives modulation on every parameter for free | Pervasive type; expensive to retrofit, hence day-one |
| OKLCH, channel-wise | Perceptually uniform ramps look designed rather than computed | Low — a colour-space swap is contained |
| Keyed RNG, not sequential | Randomness stays stable as the document changes around it | High — sequential streams make the tool untrustworthy |
| Schema-driven inspector | New repeater types get UI for free | Medium — retrofitting means rewriting every panel |
| Pure geometry core | Test surface, memoisation, renderer swap, future worker | Very high — the boundary must not bend |
| Booleans at the edges only | Avoids per-frame path maths on thousands of instances | Accepted limitation, documented in §7.3 |
| Stacked-card inspector (layout A) | Whole layer visible at a glance; simplest to build | Low — a chip strip can be added above later |

## 15. Deferred, with the door left open

- **Web Worker evaluation** — viable because geometry is pure; build only if profiling demands it.
- **WebGL renderer** — additive behind the `Renderer` interface.
- **SVG export** — Phase 4, same interface.
- **Animation over time** — the modulation system generalises naturally (`source: 'time'`), but no design work has been done and none should be assumed.
- **Instance-level booleans** — would require the path-algebra core rejected in §7.3.
- **Canvas click-to-select** — Phase 4, genuinely optional.
