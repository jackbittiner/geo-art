# geo-art Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an end-to-end geometric art tool — build a layer, repeat a shape radially, colour it in translucent OKLCH, see it render live, and export it as a PNG.

**Architecture:** A pure geometry core (`src/geometry/`) turns a plain-data `Document` into a flat list of `Instance` objects via a single entry point, `evaluate()`. A `Renderer` interface consumes that list; the Canvas 2D backend is the only implementation in Phase 1. React + zustand own the document and the three-pane UI; the inspector renders itself from field descriptors rather than hand-written panels.

**Tech Stack:** Vite, React 19, TypeScript (strict), Tailwind v4, zustand, zod, Vitest, fast-check, jsdom + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-29-geometric-art-tool-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Boundary (non-negotiable, spec §4):** `src/geometry/` imports nothing from `render/`, `state/`, `ui/`, React, or the DOM. No `Path2D`, no `CanvasRenderingContext2D`, no `document`. Task 2 adds an automated test enforcing this; it must never be weakened.
- `src/render/` imports from `geometry/` and `document/` — never from `state/` or `ui/`.
  (Amended after the whole-branch review: `buildScene` and `exportPng` take a `Document`,
  and relocating them would buy nothing. Enforced by `src/render/boundaries.test.ts`.)
- `src/document/ops.ts` functions are pure: document in, **new** document out. Never mutate.
- `evaluate()` is the only entry point into the geometry engine.
- **Angles are stored in degrees** in the document (UI-friendly) and converted to radians at the point of use inside geometry. Never store radians in a `Document`.
- **Colour is OKLCH**, channel-wise, `{ l, c, h, a }` with `l` and `a` in 0–1, `c` in 0–0.4, `h` in degrees. Never HSL, never hex, in the document or in geometry.
- **Painter's order:** `layers[0]` is the bottom layer, drawn first.
- `maxInstances` default is `100_000`.
- TypeScript `strict: true`. No `any` in committed code.
- Commit after every task. Conventional commit prefixes (`feat:`, `test:`, `chore:`).

## Phase 1 scope boundary

In Phase 1 the `Field` type and `resolve()` are fully implemented and tested, but **no UI creates a `Modulated` field and no starter document contains one** (spec §13). Build the types; leave the `~` toggle for Phase 2.

Also deferred, and deliberately absent from this plan: chained repeaters beyond one link, grid/path/recursive/mirror/symmetry/kaleido repeaters, star/superellipse/arc shapes, `cornerRadius`, blend modes, layer opacity, layer masks, undo/redo, stride sampling, per-layer memoisation, keyed RNG and `jitter`, canvas click-to-select.

## File structure

| File | Responsibility |
|---|---|
| `src/geometry/transform.ts` | `Mat2D` affine matrix algebra. |
| `src/geometry/path.ts` | `Path`/`Segment` types, `bbox`, `transformPath`. |
| `src/geometry/shapes.ts` | `polygon`, `ellipse` → `Path`. |
| `src/geometry/easing.ts` | `Easing` union and `ease()`. |
| `src/geometry/context.ts` | `EvalContext` type and root constructor. |
| `src/geometry/field.ts` | `Field`/`Modulated` types, `isModulated`, `resolve`. |
| `src/geometry/repeaters/types.ts` | `Repeater` interface, `Placement`. |
| `src/geometry/repeaters/radial.ts` | The radial repeater. |
| `src/geometry/repeaters/index.ts` | Type→implementation registry. |
| `src/geometry/instance.ts` | `Instance`, `ResolvedColour`, `ResolvedStyle`, `EvaluationResult`. |
| `src/geometry/evaluate.ts` | `evaluate(doc)` — the single engine entry point. |
| `src/document/schema.ts` | `Document`/`Layer`/config types + zod schemas. |
| `src/document/defaults.ts` | `emptyDocument()`, `defaultLayer()`, id generation. |
| `src/document/ops.ts` | Pure document mutations. |
| `src/document/serialize.ts` | JSON round-trip, version migrations. |
| `src/document/starters.ts` | Bundled example documents. |
| `src/render/colour.ts` | `ResolvedColour` → CSS `oklch()` string, memoised. |
| `src/render/path2d.ts` | `Path` → `Path2D`, identity-cached. |
| `src/render/renderer.ts` | `Renderer` interface, `Scene`, `Viewport`. |
| `src/render/canvas2d.ts` | Canvas 2D backend. |
| `src/render/fake.ts` | `FakeRenderer` for tests. |
| `src/render/exportPng.ts` | Offscreen render → PNG blob. |
| `src/state/store.ts` | zustand store. |
| `src/ui/App.tsx` | Three-pane shell. |
| `src/ui/TopBar.tsx` | Canvas size, export, save/load. |
| `src/ui/LayerList.tsx` | Layer add/select/reorder/visibility/delete. |
| `src/ui/CanvasView.tsx` | Canvas element, renderer lifecycle, pan/zoom. |
| `src/ui/Inspector.tsx` | Stacked cards, driven by descriptors. |
| `src/ui/descriptors.ts` | `FieldDescriptor` lists per shape/repeater type. |
| `src/ui/controls/FieldRow.tsx` | Label · slider · number box. |

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/index.css`, `src/ui/App.tsx`
- Test: `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `App` (default export, React component); `npm test`, `npm run dev`, `npm run build` scripts.

- [ ] **Step 1: Initialise and install**

```bash
npm init -y
npm install react react-dom zustand zod
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom \
  vitest fast-check jsdom @testing-library/react @testing-library/jest-dom \
  tailwindcss @tailwindcss/vite
```

- [ ] **Step 2: Write config files**

`package.json` — replace the `"scripts"` and `"main"` block with:

```json
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

`vite.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>geo-art</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/index.css`:

```css
@import "tailwindcss";

html, body, #root { height: 100%; }
body { margin: 0; overscroll-behavior: none; }
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './ui/App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 3: Write the failing test**

`src/ui/App.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the three panes', () => {
    render(<App />)
    expect(screen.getByTestId('layers-pane')).toBeDefined()
    expect(screen.getByTestId('canvas-pane')).toBeDefined()
    expect(screen.getByTestId('inspector-pane')).toBeDefined()
  })
})
```

- [ ] **Step 4: Run it and watch it fail**

Run: `npm test -- src/ui/App.test.tsx`
Expected: FAIL — cannot resolve `./App`.

- [ ] **Step 5: Write the minimal App**

`src/ui/App.tsx`:

```tsx
export default function App() {
  return (
    <div className="flex h-full flex-col bg-neutral-900 text-neutral-100">
      <div className="flex min-h-0 flex-1">
        <aside data-testid="layers-pane" className="w-52 shrink-0 border-r border-neutral-800" />
        <main data-testid="canvas-pane" className="min-w-0 flex-1" />
        <aside data-testid="inspector-pane" className="w-80 shrink-0 border-l border-neutral-800" />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run it and watch it pass**

Run: `npm test`
Expected: PASS, 1 test.

Then run: `npm run build`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite + react + tailwind + vitest"
```

---

### Task 2: Mat2D transforms

**Files:**
- Create: `src/geometry/transform.ts`
- Test: `src/geometry/transform.test.ts`, `src/geometry/boundaries.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Mat2D = readonly [number, number, number, number, number, number]`; `IDENTITY`, `compose(outer, inner)`, `translate(tx, ty)`, `rotate(radians)`, `scale(sx, sy)`, `applyPoint(m, p)`, `invert(m)`, `determinant(m)`. `type Point = { x: number; y: number }` is defined here and re-exported by `path.ts`.

Matrix layout matches `CanvasRenderingContext2D.setTransform(a, b, c, d, e, f)`:

```
| a c e |     x' = a*x + c*y + e
| b d f |     y' = b*x + d*y + f
| 0 0 1 |
```

- [ ] **Step 1: Write the failing tests**

`src/geometry/transform.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { IDENTITY, compose, translate, rotate, scale, applyPoint, invert, determinant } from './transform'

const closeTo = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps

describe('transform', () => {
  it('identity leaves a point alone', () => {
    expect(applyPoint(IDENTITY, { x: 3, y: -7 })).toEqual({ x: 3, y: -7 })
  })

  it('translate moves a point', () => {
    expect(applyPoint(translate(10, 5), { x: 1, y: 2 })).toEqual({ x: 11, y: 7 })
  })

  it('rotate by 90 degrees maps (1,0) to (0,1)', () => {
    const p = applyPoint(rotate(Math.PI / 2), { x: 1, y: 0 })
    expect(closeTo(p.x, 0)).toBe(true)
    expect(closeTo(p.y, 1)).toBe(true)
  })

  it('compose applies the inner transform first', () => {
    // translate then rotate: the translation should be rotated too
    const m = compose(rotate(Math.PI / 2), translate(1, 0))
    const p = applyPoint(m, { x: 0, y: 0 })
    expect(closeTo(p.x, 0)).toBe(true)
    expect(closeTo(p.y, 1)).toBe(true)
  })

  it('scale multiplies both axes', () => {
    expect(applyPoint(scale(2, 3), { x: 4, y: 5 })).toEqual({ x: 8, y: 15 })
  })

  it('determinant of a rotation is 1', () => {
    expect(closeTo(determinant(rotate(0.7)), 1)).toBe(true)
  })

  // --- property-based ---

  const arbFinite = fc.double({ min: -1000, max: 1000, noNaN: true })
  const arbMat = fc
    .tuple(arbFinite, arbFinite, arbFinite, arbFinite)
    .filter(([a, b, c, d]) => Math.abs(a * d - b * c) > 1e-3)
    .chain(([a, b, c, d]) =>
      fc.tuple(arbFinite, arbFinite).map(([e, f]) => [a, b, c, d, e, f] as const),
    )

  it('invert round-trips any invertible matrix', () => {
    fc.assert(
      fc.property(arbMat, arbFinite, arbFinite, (m, x, y) => {
        const there = applyPoint(m, { x, y })
        const back = applyPoint(invert(m), there)
        return closeTo(back.x, x, 1e-4) && closeTo(back.y, y, 1e-4)
      }),
    )
  })

  it('compose is associative', () => {
    fc.assert(
      fc.property(arbMat, arbMat, arbMat, arbFinite, arbFinite, (a, b, c, x, y) => {
        const left = applyPoint(compose(compose(a, b), c), { x, y })
        const right = applyPoint(compose(a, compose(b, c)), { x, y })
        return closeTo(left.x, right.x, 1e-4) && closeTo(left.y, right.y, 1e-4)
      }),
    )
  })
})
```

`src/geometry/boundaries.test.ts` — the architectural guard from the Global Constraints:

```ts
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Value imports from these layers are forbidden. `import type` is allowed from
 * document/ only: type-only imports are erased at compile time, so geometry
 * still has no runtime dependency on the document layer.
 */
const FORBIDDEN = [
  /^import\s+(?!type\b)[^\n]*from\s+['"](\.\.\/)*(render|state|ui|document)\//m,
  /^import\s+[^\n]*from\s+['"](\.\.\/)*(render|state|ui)\//m,
  /from\s+['"]react['"]/,
  /\bPath2D\b/,
  /\bCanvasRenderingContext2D\b/,
  /\bdocument\./,
  /\bwindow\./,
]

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : []
  })
}

describe('geometry purity boundary', () => {
  it('geometry/ has no value imports from render, state, ui or document, and no react or DOM', () => {
    const offenders: string[] = []
    for (const file of walk('src/geometry')) {
      const source = readFileSync(file, 'utf8')
      for (const pattern of FORBIDDEN) {
        if (pattern.test(source)) offenders.push(`${file} matches ${pattern}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Run both and watch them fail**

Run: `npm test -- src/geometry`
Expected: `transform.test.ts` FAILs (module not found); `boundaries.test.ts` FAILs (`src/geometry` does not exist).

- [ ] **Step 3: Implement**

`src/geometry/transform.ts`:

```ts
export type Point = { x: number; y: number }

/** [a, b, c, d, e, f] — matches CanvasRenderingContext2D.setTransform. */
export type Mat2D = readonly [number, number, number, number, number, number]

export const IDENTITY: Mat2D = [1, 0, 0, 1, 0, 0]

/** compose(outer, inner) applies `inner` first, then `outer`. */
export function compose(outer: Mat2D, inner: Mat2D): Mat2D {
  const [a1, b1, c1, d1, e1, f1] = outer
  const [a2, b2, c2, d2, e2, f2] = inner
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ]
}

export function translate(tx: number, ty: number): Mat2D {
  return [1, 0, 0, 1, tx, ty]
}

export function rotate(radians: number): Mat2D {
  const c = Math.cos(radians)
  const s = Math.sin(radians)
  return [c, s, -s, c, 0, 0]
}

export function scale(sx: number, sy: number = sx): Mat2D {
  return [sx, 0, 0, sy, 0, 0]
}

export function applyPoint(m: Mat2D, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }
}

export function determinant(m: Mat2D): number {
  return m[0] * m[3] - m[1] * m[2]
}

export function invert(m: Mat2D): Mat2D {
  const det = determinant(m)
  if (det === 0) throw new Error('Matrix is not invertible')
  const [a, b, c, d, e, f] = m
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]
}

export const degToRad = (deg: number): number => (deg * Math.PI) / 180
```

- [ ] **Step 4: Run and watch them pass**

Run: `npm test -- src/geometry`
Expected: PASS.

- [ ] **Step 5: Prove the boundary test actually bites**

Temporarily add `import { useState } from 'react'` to the top of `src/geometry/transform.ts`.
Run: `npm test -- src/geometry/boundaries.test.ts`
Expected: FAIL, listing `src/geometry/transform.ts matches /from\s+['"]react['"]/`.

Remove the import. Re-run. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/geometry
git commit -m "feat: Mat2D affine transforms with purity boundary test"
```

---

### Task 3: Path type

**Files:**
- Create: `src/geometry/path.ts`
- Test: `src/geometry/path.test.ts`

**Interfaces:**
- Consumes: `Mat2D`, `Point`, `applyPoint` from `./transform`.
- Produces: `type Segment`, `type Path = { segments: Segment[] }`, `type Rect = { x: number; y: number; w: number; h: number }`, `bbox(path)`, `transformPath(path, m)`.

`bbox` is **conservative** for cubics — it includes control points, so it may be larger than the true visual bounds. That is correct for its Phase 1 use (fit-to-view) and is cheaper than solving for curve extrema.

- [ ] **Step 1: Write the failing test**

`src/geometry/path.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { bbox, transformPath, type Path } from './path'
import { translate, scale } from './transform'

const square: Path = {
  segments: [
    { c: 'M', p: { x: -1, y: -1 } },
    { c: 'L', p: { x: 1, y: -1 } },
    { c: 'L', p: { x: 1, y: 1 } },
    { c: 'L', p: { x: -1, y: 1 } },
    { c: 'Z' },
  ],
}

describe('path', () => {
  it('computes a bounding box', () => {
    expect(bbox(square)).toEqual({ x: -1, y: -1, w: 2, h: 2 })
  })

  it('includes cubic control points in the bounding box', () => {
    const curved: Path = {
      segments: [
        { c: 'M', p: { x: 0, y: 0 } },
        { c: 'C', c1: { x: 0, y: 10 }, c2: { x: 5, y: 10 }, p: { x: 5, y: 0 } },
      ],
    }
    expect(bbox(curved)).toEqual({ x: 0, y: 0, w: 5, h: 10 })
  })

  it('returns a zero rect for an empty path', () => {
    expect(bbox({ segments: [] })).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })

  it('transforms every point and leaves the original untouched', () => {
    const moved = transformPath(square, translate(10, 0))
    expect(bbox(moved)).toEqual({ x: 9, y: -1, w: 2, h: 2 })
    expect(bbox(square)).toEqual({ x: -1, y: -1, w: 2, h: 2 })
  })

  it('transforms cubic control points too', () => {
    const curved: Path = {
      segments: [
        { c: 'M', p: { x: 0, y: 0 } },
        { c: 'C', c1: { x: 1, y: 1 }, c2: { x: 2, y: 2 }, p: { x: 3, y: 3 } },
      ],
    }
    const out = transformPath(curved, scale(2, 2))
    expect(out.segments[1]).toEqual({
      c: 'C',
      c1: { x: 2, y: 2 },
      c2: { x: 4, y: 4 },
      p: { x: 6, y: 6 },
    })
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/geometry/path.test.ts`
Expected: FAIL — cannot resolve `./path`.

- [ ] **Step 3: Implement**

`src/geometry/path.ts`:

```ts
import { applyPoint, type Mat2D, type Point } from './transform'

export type { Point }

export type Segment =
  | { c: 'M'; p: Point }
  | { c: 'L'; p: Point }
  | { c: 'C'; c1: Point; c2: Point; p: Point }
  | { c: 'Z' }

export type Path = { segments: Segment[] }

export type Rect = { x: number; y: number; w: number; h: number }

function pointsOf(seg: Segment): Point[] {
  switch (seg.c) {
    case 'M':
    case 'L':
      return [seg.p]
    case 'C':
      return [seg.c1, seg.c2, seg.p]
    case 'Z':
      return []
  }
}

/** Conservative for cubics: includes control points. */
export function bbox(path: Path): Rect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const seg of path.segments) {
    for (const p of pointsOf(seg)) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }
  if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function transformPath(path: Path, m: Mat2D): Path {
  return {
    segments: path.segments.map((seg): Segment => {
      switch (seg.c) {
        case 'M':
          return { c: 'M', p: applyPoint(m, seg.p) }
        case 'L':
          return { c: 'L', p: applyPoint(m, seg.p) }
        case 'C':
          return {
            c: 'C',
            c1: applyPoint(m, seg.c1),
            c2: applyPoint(m, seg.c2),
            p: applyPoint(m, seg.p),
          }
        case 'Z':
          return { c: 'Z' }
      }
    }),
  }
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test -- src/geometry`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/geometry
git commit -m "feat: Path type with bbox and transform"
```

---

### Task 4: Shape generators

**Files:**
- Create: `src/geometry/shapes.ts`
- Test: `src/geometry/shapes.test.ts`

**Interfaces:**
- Consumes: `Path`, `transformPath` from `./path`; `rotate`, `degToRad` from `./transform`.
- Produces: `polygon(sides, radius, rotationDeg)`, `ellipse(rx, ry, rotationDeg)`. Both return a closed `Path` centred on the origin. `polygon`'s first vertex points **up** (−Y).

- [ ] **Step 1: Write the failing test**

`src/geometry/shapes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { polygon, ellipse } from './shapes'
import { bbox } from './path'

describe('polygon', () => {
  it('produces one vertex per side plus a close', () => {
    const p = polygon(6, 10, 0)
    expect(p.segments.filter((s) => s.c === 'M' || s.c === 'L')).toHaveLength(6)
    expect(p.segments.at(-1)).toEqual({ c: 'Z' })
  })

  it('puts the first vertex straight up', () => {
    const [first] = polygon(4, 10, 0).segments
    expect(first.c).toBe('M')
    if (first.c !== 'M') throw new Error('unreachable')
    expect(Math.abs(first.p.x)).toBeLessThan(1e-9)
    expect(first.p.y).toBeCloseTo(-10, 9)
  })

  it('clamps to a minimum of 3 sides', () => {
    expect(polygon(1, 10, 0).segments.filter((s) => s.c !== 'Z')).toHaveLength(3)
  })

  it('places every vertex at the given radius', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 60 }),
        fc.double({ min: 1, max: 500, noNaN: true }),
        (sides, radius) =>
          polygon(sides, radius, 0)
            .segments.flatMap((s) => (s.c === 'M' || s.c === 'L' ? [s.p] : []))
            .every((p) => Math.abs(Math.hypot(p.x, p.y) - radius) < 1e-6),
      ),
    )
  })
})

describe('ellipse', () => {
  it('is four cubics and a close', () => {
    const e = ellipse(20, 10, 0)
    expect(e.segments.filter((s) => s.c === 'C')).toHaveLength(4)
    expect(e.segments.at(-1)).toEqual({ c: 'Z' })
  })

  it('has a bounding box matching its radii', () => {
    const b = bbox(ellipse(20, 10, 0))
    expect(b.w).toBeCloseTo(40, 6)
    expect(b.h).toBeCloseTo(20, 6)
  })

  it('rotating a circle by any angle leaves its bounding box unchanged', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 360, noNaN: true }), (deg) => {
        const b = bbox(ellipse(15, 15, deg))
        return Math.abs(b.w - 30) < 1e-6 && Math.abs(b.h - 30) < 1e-6
      }),
    )
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/geometry/shapes.test.ts`
Expected: FAIL — cannot resolve `./shapes`.

- [ ] **Step 3: Implement**

`src/geometry/shapes.ts`:

```ts
import { transformPath, type Path, type Segment } from './path'
import { degToRad, rotate } from './transform'

/** Circle-to-cubic-bezier constant. */
const KAPPA = 0.5522847498307936

export function polygon(sides: number, radius: number, rotationDeg = 0): Path {
  const n = Math.max(3, Math.round(sides))
  const phase = degToRad(rotationDeg) - Math.PI / 2
  const segments: Segment[] = []
  for (let i = 0; i < n; i++) {
    const a = phase + (i * 2 * Math.PI) / n
    const p = { x: radius * Math.cos(a), y: radius * Math.sin(a) }
    segments.push(i === 0 ? { c: 'M', p } : { c: 'L', p })
  }
  segments.push({ c: 'Z' })
  return { segments }
}

export function ellipse(rx: number, ry: number, rotationDeg = 0): Path {
  const ox = rx * KAPPA
  const oy = ry * KAPPA
  const path: Path = {
    segments: [
      { c: 'M', p: { x: 0, y: -ry } },
      { c: 'C', c1: { x: ox, y: -ry }, c2: { x: rx, y: -oy }, p: { x: rx, y: 0 } },
      { c: 'C', c1: { x: rx, y: oy }, c2: { x: ox, y: ry }, p: { x: 0, y: ry } },
      { c: 'C', c1: { x: -ox, y: ry }, c2: { x: -rx, y: oy }, p: { x: -rx, y: 0 } },
      { c: 'C', c1: { x: -rx, y: -oy }, c2: { x: -ox, y: -ry }, p: { x: 0, y: -ry } },
      { c: 'Z' },
    ],
  }
  return rotationDeg === 0 ? path : transformPath(path, rotate(degToRad(rotationDeg)))
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test -- src/geometry`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/geometry
git commit -m "feat: polygon and ellipse shape generators"
```

---

### Task 5: Easing, EvalContext and Field resolution

**Files:**
- Create: `src/geometry/easing.ts`, `src/geometry/context.ts`, `src/geometry/field.ts`
- Test: `src/geometry/easing.test.ts`, `src/geometry/field.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'sine' | 'exp'`; `ease(kind, t)`.
  - `type EvalContext = { indices: number[]; counts: number[]; depth: number; t: number; flatIndex: number; total: number }`; `rootContext()`.
  - `type Modulated`, `type Field = number | Modulated`, `isModulated(f)`, `resolve(field, ctx)`.

Phase 1 supports `source` values `'index' | 't' | 'flatIndex'` only. `'depth' | 'radius' | 'angle'` are in the spec's schema but arrive in Phase 2, when there is a repeater that varies them; `resolve` throws on them so the gap is loud rather than silent.

- [ ] **Step 1: Write the failing tests**

`src/geometry/easing.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { ease, EASINGS } from './easing'

describe('ease', () => {
  it('pins both ends for every curve', () => {
    for (const kind of EASINGS) {
      expect(ease(kind, 0)).toBeCloseTo(0, 9)
      expect(ease(kind, 1)).toBeCloseTo(1, 9)
    }
  })

  it('clamps out-of-range input', () => {
    expect(ease('linear', -5)).toBe(0)
    expect(ease('linear', 5)).toBe(1)
  })

  it('is monotonic non-decreasing', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...EASINGS),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (kind, a, b) => {
          const [lo, hi] = a <= b ? [a, b] : [b, a]
          return ease(kind, hi) >= ease(kind, lo) - 1e-12
        },
      ),
    )
  })
})
```

`src/geometry/field.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolve, isModulated, type Modulated } from './field'
import { rootContext, type EvalContext } from './context'

const ctx = (over: Partial<EvalContext> = {}): EvalContext => ({ ...rootContext(), ...over })

describe('resolve', () => {
  it('returns a plain number unchanged', () => {
    expect(resolve(42, ctx())).toBe(42)
  })

  it('isModulated discriminates', () => {
    expect(isModulated(42)).toBe(false)
    expect(isModulated({ base: 0, to: 1, source: 't', curve: 'linear' })).toBe(true)
  })

  it('ramps linearly across the innermost repeater index', () => {
    const field: Modulated = { base: 0, to: 100, source: 'index', curve: 'linear' }
    expect(resolve(field, ctx({ indices: [0], counts: [5] }))).toBeCloseTo(0)
    expect(resolve(field, ctx({ indices: [2], counts: [5] }))).toBeCloseTo(50)
    expect(resolve(field, ctx({ indices: [4], counts: [5] }))).toBeCloseTo(100)
  })

  it('returns base when a repeater has a single copy', () => {
    const field: Modulated = { base: 7, to: 99, source: 'index', curve: 'linear' }
    expect(resolve(field, ctx({ indices: [0], counts: [1] }))).toBe(7)
  })

  it('targets an outer chain level when level is given', () => {
    const field: Modulated = { base: 0, to: 10, source: 'index', level: 0, curve: 'linear' }
    expect(resolve(field, ctx({ indices: [1, 9], counts: [3, 10] }))).toBeCloseTo(5)
  })

  it('applies the easing curve', () => {
    const field: Modulated = { base: 0, to: 100, source: 't', curve: 'easeIn' }
    expect(resolve(field, ctx({ t: 0.5 }))).toBeCloseTo(25)
  })

  it('repeats the ramp when cycles > 1', () => {
    const field: Modulated = { base: 0, to: 100, source: 't', curve: 'linear', cycles: 2 }
    expect(resolve(field, ctx({ t: 0.25 }))).toBeCloseTo(50)
    expect(resolve(field, ctx({ t: 0.5 }))).toBeCloseTo(0)
    expect(resolve(field, ctx({ t: 1 }))).toBeCloseTo(100)
  })

  it('normalises flatIndex across the whole layer', () => {
    const field: Modulated = { base: 0, to: 1, source: 'flatIndex', curve: 'linear' }
    expect(resolve(field, ctx({ flatIndex: 3, total: 7 }))).toBeCloseTo(0.5)
  })

  it('throws on a source that Phase 1 does not implement', () => {
    const field = { base: 0, to: 1, source: 'radius', curve: 'linear' } as unknown as Modulated
    expect(() => resolve(field, ctx())).toThrow(/not supported/i)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npm test -- src/geometry/easing.test.ts src/geometry/field.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/geometry/easing.ts`:

```ts
export const EASINGS = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'sine', 'exp'] as const
export type Easing = (typeof EASINGS)[number]

export function ease(kind: Easing, t: number): number {
  const x = Math.min(1, Math.max(0, t))
  switch (kind) {
    case 'linear':
      return x
    case 'easeIn':
      return x * x
    case 'easeOut':
      return 1 - (1 - x) * (1 - x)
    case 'easeInOut':
      return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2
    case 'sine':
      return 0.5 - 0.5 * Math.cos(Math.PI * x)
    case 'exp':
      return x === 0 ? 0 : x === 1 ? 1 : 2 ** (10 * x - 10)
  }
}
```

`src/geometry/context.ts`:

```ts
export type EvalContext = {
  /** Index at each level of the repeater chain, outermost first. */
  indices: number[]
  /** Copy count at each level of the repeater chain. */
  counts: number[]
  /** Recursion depth (always 0 until the recursive repeater lands in Phase 2). */
  depth: number
  /** Normalised position within the innermost repeater, 0..1. */
  t: number
  /** Index across every instance the layer produces. */
  flatIndex: number
  /** Total instances the layer produces. */
  total: number
}

export function rootContext(): EvalContext {
  return { indices: [], counts: [], depth: 0, t: 0, flatIndex: 0, total: 1 }
}
```

`src/geometry/field.ts`:

```ts
import { ease, type Easing } from './easing'
import type { EvalContext } from './context'

export type ModulationSource = 'index' | 't' | 'flatIndex' | 'depth' | 'radius' | 'angle'

export type Modulated = {
  base: number
  to: number
  source: ModulationSource
  /** Which link of the repeater chain drives it. Defaults to the innermost. */
  level?: number
  curve: Easing
  cycles?: number
}

export type Field = number | Modulated

export function isModulated(field: Field): field is Modulated {
  return typeof field !== 'number'
}

function sourceValue(field: Modulated, ctx: EvalContext): number {
  switch (field.source) {
    case 't':
      return ctx.t
    case 'flatIndex':
      return ctx.total <= 1 ? 0 : ctx.flatIndex / (ctx.total - 1)
    case 'index': {
      const level = field.level ?? ctx.indices.length - 1
      if (level < 0 || level >= ctx.indices.length) return 0
      const count = ctx.counts[level]
      return count <= 1 ? 0 : ctx.indices[level] / (count - 1)
    }
    default:
      throw new Error(`Modulation source "${field.source}" is not supported in Phase 1`)
  }
}

export function resolve(field: Field, ctx: EvalContext): number {
  if (typeof field === 'number') return field
  const u = sourceValue(field, ctx)
  const cycles = field.cycles ?? 1
  const cycled = cycles > 1 && u < 1 ? (u * cycles) % 1 : u
  return field.base + (field.to - field.base) * ease(field.curve, cycled)
}
```

- [ ] **Step 4: Run and watch them pass**

Run: `npm test -- src/geometry`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/geometry
git commit -m "feat: easing curves, eval context and Field resolution"
```

---

### Task 6: Repeater interface and the radial repeater

**Files:**
- Create: `src/geometry/repeaters/types.ts`, `src/geometry/repeaters/radial.ts`, `src/geometry/repeaters/index.ts`
- Test: `src/geometry/repeaters/radial.test.ts`

**Interfaces:**
- Consumes: `Mat2D`, `compose`, `translate`, `rotate`, `degToRad`; `Field`, `resolve`; `EvalContext`.
- Produces:
  - `type Placement = { transform: Mat2D; ctx: EvalContext }` — the repeater builds its children's contexts, so `evaluate()` never has to reconstruct them.
  - `interface Repeater<C> { type: string; expand(config: C, parent: EvalContext): Placement[]; estimate(config: C): number }`
  - `type RadialConfig = { type: 'radial'; count: Field; radius: Field; startAngle: Field; spin: Field }`
  - `type RepeaterConfig = RadialConfig` (a union that grows in Phase 2)
  - `getRepeater(type)` registry lookup.

`startAngle` and `spin` are **degrees**. A mandala whose copies rotate with the ring is expressed as a modulated `spin`, not a repeater flag — this is why `spin` is resolved against the *child* context.

- [ ] **Step 1: Write the failing test**

`src/geometry/repeaters/radial.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { radial } from './radial'
import { getRepeater } from './index'
import { rootContext } from '../context'
import { applyPoint } from '../transform'
import type { RadialConfig } from './types'

const config = (over: Partial<RadialConfig> = {}): RadialConfig => ({
  type: 'radial',
  count: 6,
  radius: 100,
  startAngle: 0,
  spin: 0,
  ...over,
})

describe('radial repeater', () => {
  it('produces one placement per copy', () => {
    expect(radial.expand(config({ count: 12 }), rootContext())).toHaveLength(12)
  })

  it('estimates its count without evaluating', () => {
    expect(radial.estimate(config({ count: 12 }))).toBe(12)
    expect(
      radial.estimate(config({ count: { base: 3, to: 20, source: 't', curve: 'linear' } })),
    ).toBe(20)
  })

  it('places the first copy at startAngle', () => {
    const [first] = radial.expand(config({ count: 4, radius: 10, startAngle: 0 }), rootContext())
    const p = applyPoint(first.transform, { x: 0, y: 0 })
    expect(p.x).toBeCloseTo(10, 9)
    expect(p.y).toBeCloseTo(0, 9)
  })

  it('gives each child an index, count and normalised t', () => {
    const out = radial.expand(config({ count: 5 }), rootContext())
    expect(out.map((p) => p.ctx.indices[0])).toEqual([0, 1, 2, 3, 4])
    expect(out[0].ctx.counts).toEqual([5])
    expect(out[2].ctx.t).toBeCloseTo(0.5)
  })

  it('resolves spin against the child context so it can ramp per copy', () => {
    const out = radial.expand(
      config({ count: 4, radius: 0, spin: { base: 0, to: 90, source: 'index', curve: 'linear' } }),
      rootContext(),
    )
    // Copy 3 of 4 spins a full 90 degrees: (1,0) maps to (0,1).
    const p = applyPoint(out[3].transform, { x: 1, y: 0 })
    expect(p.x).toBeCloseTo(0, 9)
    expect(p.y).toBeCloseTo(1, 9)
  })

  it('clamps to at least one copy', () => {
    expect(radial.expand(config({ count: 0 }), rootContext())).toHaveLength(1)
  })

  it('places every copy at exactly the given radius', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.double({ min: 0, max: 900, noNaN: true }),
        fc.double({ min: -360, max: 360, noNaN: true }),
        (count, radius, startAngle) =>
          radial
            .expand(config({ count, radius, startAngle }), rootContext())
            .every((pl) => {
              const p = applyPoint(pl.transform, { x: 0, y: 0 })
              return Math.abs(Math.hypot(p.x, p.y) - radius) < 1e-6
            }),
      ),
    )
  })

  it('is reachable through the registry', () => {
    expect(getRepeater('radial')).toBe(radial)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/geometry/repeaters`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/geometry/repeaters/types.ts`:

```ts
import type { EvalContext } from '../context'
import type { Field } from '../field'
import type { Mat2D } from '../transform'

export type Placement = {
  transform: Mat2D
  /** The child context, built by the repeater. */
  ctx: EvalContext
}

export interface Repeater<C> {
  type: string
  expand(config: C, parent: EvalContext): Placement[]
  /** Cheap upper bound on copy count, for the explosion guard. */
  estimate(config: C): number
}

export type RadialConfig = {
  type: 'radial'
  count: Field
  /** Distance of each copy from the layer origin. */
  radius: Field
  /** Degrees. Angle of the first copy. */
  startAngle: Field
  /** Degrees. Rotation of each copy about its own centre. */
  spin: Field
}

/** Grows in Phase 2 with grid, path, recursive, mirror, symmetry, kaleido. */
export type RepeaterConfig = RadialConfig
export type RepeaterType = RepeaterConfig['type']
```

`src/geometry/repeaters/radial.ts`:

```ts
import type { EvalContext } from '../context'
import { isModulated, resolve, type Field } from '../field'
import { compose, degToRad, rotate, translate } from '../transform'
import type { Placement, RadialConfig, Repeater } from './types'

function upperBound(field: Field): number {
  return isModulated(field) ? Math.max(field.base, field.to) : field
}

export const radial: Repeater<RadialConfig> = {
  type: 'radial',

  expand(config: RadialConfig, parent: EvalContext): Placement[] {
    const count = Math.max(1, Math.round(resolve(config.count, parent)))
    const radius = resolve(config.radius, parent)
    const startAngle = degToRad(resolve(config.startAngle, parent))

    const placements: Placement[] = []
    for (let i = 0; i < count; i++) {
      const ctx: EvalContext = {
        ...parent,
        indices: [...parent.indices, i],
        counts: [...parent.counts, count],
        t: count <= 1 ? 0 : i / (count - 1),
      }
      const theta = startAngle + (i * 2 * Math.PI) / count
      const spin = degToRad(resolve(config.spin, ctx))
      placements.push({
        transform: compose(
          translate(radius * Math.cos(theta), radius * Math.sin(theta)),
          rotate(spin),
        ),
        ctx,
      })
    }
    return placements
  },

  estimate(config: RadialConfig): number {
    return Math.max(1, Math.round(upperBound(config.count)))
  },
}
```

`src/geometry/repeaters/index.ts`:

```ts
import { radial } from './radial'
import type { Repeater, RepeaterConfig, RepeaterType } from './types'

const REGISTRY: Record<RepeaterType, Repeater<never>> = {
  radial: radial as Repeater<never>,
}

export function getRepeater(type: RepeaterType): Repeater<RepeaterConfig> {
  const found = REGISTRY[type]
  if (!found) throw new Error(`Unknown repeater type: ${type}`)
  return found as Repeater<RepeaterConfig>
}

export { radial }
export type { Placement, Repeater, RepeaterConfig, RepeaterType, RadialConfig } from './types'
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test -- src/geometry`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/geometry
git commit -m "feat: repeater interface and radial repeater"
```

---

### Task 7: Document schema and defaults

**Files:**
- Create: `src/document/schema.ts`, `src/document/defaults.ts`
- Test: `src/document/schema.test.ts`

**Interfaces:**
- Consumes: `Field`, `Modulated` types from `../geometry/field`; `RepeaterConfig` from `../geometry/repeaters`; `EASINGS` from `../geometry/easing`.
- Produces: types `LayerId`, `Colour`, `StyleConfig`, `ShapeConfig`, `ShapeType`, `BlendMode`, `Layer`, `Document`; zod schemas `documentSchema`, `layerSchema`; `emptyDocument()`, `defaultLayer(name)`, `newId()`.

Geometry consumes these types with `import type` only — no runtime import, so the purity boundary holds (see Task 2's boundary test).

- [ ] **Step 1: Write the failing test**

`src/document/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { documentSchema } from './schema'
import { emptyDocument, defaultLayer } from './defaults'

describe('document schema', () => {
  it('accepts an empty document', () => {
    expect(documentSchema.safeParse(emptyDocument()).success).toBe(true)
  })

  it('accepts a document with a default layer', () => {
    const doc = emptyDocument()
    doc.layers.push(defaultLayer('halo'))
    expect(documentSchema.safeParse(doc).success).toBe(true)
  })

  it('accepts a modulated field', () => {
    const doc = emptyDocument()
    const layer = defaultLayer('halo')
    layer.repeaters[0].spin = { base: 0, to: 360, source: 'index', curve: 'linear' }
    doc.layers.push(layer)
    expect(documentSchema.safeParse(doc).success).toBe(true)
  })

  it('rejects an unknown shape type', () => {
    const doc = emptyDocument()
    const layer = defaultLayer('halo')
    ;(layer.shape as { type: string }).type = 'dodecahedron'
    doc.layers.push(layer)
    expect(documentSchema.safeParse(doc).success).toBe(false)
  })

  it('rejects an out-of-range alpha', () => {
    const doc = emptyDocument()
    const layer = defaultLayer('halo')
    layer.style.fill!.a = 5
    doc.layers.push(layer)
    expect(documentSchema.safeParse(doc).success).toBe(false)
  })

  it('gives every new layer a distinct id', () => {
    expect(defaultLayer('a').id).not.toBe(defaultLayer('b').id)
  })

  it('defaults maxInstances to 100000', () => {
    expect(emptyDocument().maxInstances).toBe(100_000)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/document`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the schema**

`src/document/schema.ts`:

```ts
import { z } from 'zod'
import { EASINGS } from '../geometry/easing'
import type { Field } from '../geometry/field'
import type { RepeaterConfig } from '../geometry/repeaters'

export type LayerId = string

export type Colour = { l: Field; c: Field; h: Field; a: Field }

export type StyleConfig = {
  fill?: Colour
  stroke?: { colour: Colour; width: Field }
}

export type ShapeConfig =
  | { type: 'polygon'; sides: Field; radius: Field; rotation: Field }
  | { type: 'ellipse'; rx: Field; ry: Field; rotation: Field }

export type ShapeType = ShapeConfig['type']

/** Only 'normal' is honoured in Phase 1; the rest land in Phase 3. */
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'difference'

export type Layer = {
  id: LayerId
  name: string
  visible: boolean
  shape: ShapeConfig
  repeaters: RepeaterConfig[]
  style: StyleConfig
  blend: BlendMode
  opacity: number
}

export type Document = {
  version: 1
  seed: number
  canvas: { width: number; height: number; background: Colour }
  layers: Layer[]
  maxInstances: number
}

// --- zod ---

const modulatedSchema = z.object({
  base: z.number(),
  to: z.number(),
  source: z.enum(['index', 't', 'flatIndex', 'depth', 'radius', 'angle']),
  level: z.number().int().min(0).optional(),
  curve: z.enum(EASINGS),
  cycles: z.number().positive().optional(),
})

const fieldSchema = z.union([z.number(), modulatedSchema])

/** A Field constrained to a range when it is a plain number. */
const boundedField = (min: number, max: number) =>
  z.union([z.number().min(min).max(max), modulatedSchema])

const colourSchema = z.object({
  l: boundedField(0, 1),
  c: boundedField(0, 0.5),
  h: fieldSchema,
  a: boundedField(0, 1),
})

const shapeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('polygon'),
    sides: fieldSchema,
    radius: fieldSchema,
    rotation: fieldSchema,
  }),
  z.object({
    type: z.literal('ellipse'),
    rx: fieldSchema,
    ry: fieldSchema,
    rotation: fieldSchema,
  }),
])

const repeaterSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('radial'),
    count: fieldSchema,
    radius: fieldSchema,
    startAngle: fieldSchema,
    spin: fieldSchema,
  }),
])

const styleSchema = z.object({
  fill: colourSchema.optional(),
  stroke: z.object({ colour: colourSchema, width: fieldSchema }).optional(),
})

export const layerSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  visible: z.boolean(),
  shape: shapeSchema,
  repeaters: z.array(repeaterSchema),
  style: styleSchema,
  blend: z.enum(['normal', 'multiply', 'screen', 'overlay', 'difference']),
  opacity: z.number().min(0).max(1),
})

export const documentSchema = z.object({
  version: z.literal(1),
  seed: z.number().int(),
  canvas: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    background: colourSchema,
  }),
  layers: z.array(layerSchema),
  maxInstances: z.number().int().positive(),
})
```

- [ ] **Step 4: Implement the defaults**

`src/document/defaults.ts`:

```ts
import type { Colour, Document, Layer } from './schema'

export function newId(): string {
  return crypto.randomUUID()
}

export const WHITE_BACKGROUND: Colour = { l: 0.98, c: 0.005, h: 250, a: 1 }

export function emptyDocument(): Document {
  return {
    version: 1,
    seed: 8814,
    canvas: { width: 1200, height: 1200, background: WHITE_BACKGROUND },
    layers: [],
    maxInstances: 100_000,
  }
}

export function defaultLayer(name: string): Layer {
  return {
    id: newId(),
    name,
    visible: true,
    shape: { type: 'polygon', sides: 6, radius: 60, rotation: 0 },
    repeaters: [{ type: 'radial', count: 12, radius: 180, startAngle: 0, spin: 0 }],
    style: { fill: { l: 0.62, c: 0.18, h: 280, a: 0.35 } },
    blend: 'normal',
    opacity: 1,
  }
}
```

- [ ] **Step 5: Run and watch it pass**

Run: `npm test -- src/document`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add src/document
git commit -m "feat: document schema with zod validation and defaults"
```

---

### Task 8: evaluate()

**Files:**
- Create: `src/geometry/instance.ts`, `src/geometry/evaluate.ts`
- Test: `src/geometry/evaluate.test.ts`

**Interfaces:**
- Consumes: `Document`, `Layer`, `ShapeConfig`, `StyleConfig`, `Colour` (type-only) from `../document/schema`; `polygon`, `ellipse`; `getRepeater`; `resolve`, `isModulated`; `compose`, `IDENTITY`; `rootContext`.
- Produces:
  - `type ResolvedColour = { l: number; c: number; h: number; a: number }`
  - `type ResolvedStyle = { fill?: ResolvedColour; stroke?: { colour: ResolvedColour; width: number } }`
  - `type Instance = { path: Path; transform: Mat2D; style: ResolvedStyle }`
  - `type EvaluationResult = { layers: { layerId: LayerId; instances: Instance[] }[]; totalInstances: number; truncated: boolean; perLayerCounts: Record<LayerId, number> }`
  - `evaluate(doc: Document): EvaluationResult`

**Document coordinate space:** the origin is the **centre** of the canvas. The renderer, not the engine, applies the centring translation.

- [ ] **Step 1: Write the failing test**

`src/geometry/evaluate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { applyPoint } from './transform'
import { emptyDocument, defaultLayer } from '../document/defaults'
import type { Document } from '../document/schema'

function docWith(...mutate: ((d: Document) => void)[]): Document {
  const doc = emptyDocument()
  doc.layers.push(defaultLayer('halo'))
  for (const fn of mutate) fn(doc)
  return doc
}

describe('evaluate', () => {
  it('returns no instances for an empty document', () => {
    const result = evaluate(emptyDocument())
    expect(result.totalInstances).toBe(0)
    expect(result.layers).toEqual([])
  })

  it('produces one instance per repeater copy', () => {
    const result = evaluate(docWith((d) => { d.layers[0].repeaters[0].count = 12 }))
    expect(result.totalInstances).toBe(12)
    expect(result.layers[0].instances).toHaveLength(12)
    expect(result.perLayerCounts[result.layers[0].layerId]).toBe(12)
  })

  it('produces a single instance when a layer has no repeaters', () => {
    const result = evaluate(docWith((d) => { d.layers[0].repeaters = [] }))
    expect(result.totalInstances).toBe(1)
  })

  it('skips hidden layers but keeps their slot', () => {
    const result = evaluate(docWith((d) => { d.layers[0].visible = false }))
    expect(result.totalInstances).toBe(0)
    expect(result.layers).toHaveLength(1)
    expect(result.layers[0].instances).toEqual([])
  })

  it('reuses one Path object when the shape is constant', () => {
    const result = evaluate(docWith((d) => { d.layers[0].repeaters[0].count = 5 }))
    const paths = result.layers[0].instances.map((i) => i.path)
    expect(new Set(paths).size).toBe(1)
  })

  it('rebuilds the path per instance when a shape field is modulated', () => {
    const result = evaluate(
      docWith((d) => {
        d.layers[0].repeaters[0].count = 4
        d.layers[0].shape = {
          type: 'polygon',
          sides: { base: 3, to: 8, source: 'index', curve: 'linear' },
          radius: 60,
          rotation: 0,
        }
      }),
    )
    const paths = result.layers[0].instances.map((i) => i.path)
    expect(new Set(paths).size).toBe(4)
    const sideCounts = paths.map((p) => p.segments.filter((s) => s.c !== 'Z').length)
    expect(sideCounts).toEqual([3, 5, 6, 8])
  })

  it('resolves colour channels per instance', () => {
    const result = evaluate(
      docWith((d) => {
        d.layers[0].repeaters[0].count = 3
        d.layers[0].style.fill = {
          l: 0.6,
          c: 0.2,
          h: { base: 0, to: 100, source: 'index', curve: 'linear' },
          a: 0.5,
        }
      }),
    )
    expect(result.layers[0].instances.map((i) => i.style.fill!.h)).toEqual([0, 50, 100])
  })

  it('positions copies around the canvas origin', () => {
    const result = evaluate(
      docWith((d) => {
        d.layers[0].repeaters[0] = { type: 'radial', count: 4, radius: 100, startAngle: 0, spin: 0 }
      }),
    )
    const origins = result.layers[0].instances.map((i) => applyPoint(i.transform, { x: 0, y: 0 }))
    expect(origins[0].x).toBeCloseTo(100, 6)
    expect(origins[0].y).toBeCloseTo(0, 6)
    expect(origins[2].x).toBeCloseTo(-100, 6)
  })

  it('stops at maxInstances and reports truncation', () => {
    const result = evaluate(
      docWith((d) => {
        d.maxInstances = 10
        d.layers[0].repeaters[0].count = 50
      }),
    )
    expect(result.totalInstances).toBe(10)
    expect(result.truncated).toBe(true)
  })

  it('does not report truncation when it fits', () => {
    expect(evaluate(docWith()).truncated).toBe(false)
  })

  it('sets flatIndex and total on the context used for styling', () => {
    const result = evaluate(
      docWith((d) => {
        d.layers[0].repeaters[0].count = 4
        d.layers[0].style.fill = {
          l: { base: 0, to: 1, source: 'flatIndex', curve: 'linear' },
          c: 0.1,
          h: 200,
          a: 1,
        }
      }),
    )
    expect(result.layers[0].instances.map((i) => i.style.fill!.l)).toEqual([0, 1 / 3, 2 / 3, 1])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/geometry/evaluate.test.ts`
Expected: FAIL — cannot resolve `./evaluate`.

- [ ] **Step 3: Implement the instance types**

`src/geometry/instance.ts`:

```ts
import type { Path } from './path'
import type { Mat2D } from './transform'

export type ResolvedColour = { l: number; c: number; h: number; a: number }

export type ResolvedStyle = {
  fill?: ResolvedColour
  stroke?: { colour: ResolvedColour; width: number }
}

export type Instance = {
  path: Path
  transform: Mat2D
  style: ResolvedStyle
}

export type EvaluationResult = {
  layers: { layerId: string; instances: Instance[] }[]
  totalInstances: number
  truncated: boolean
  perLayerCounts: Record<string, number>
}
```

- [ ] **Step 4: Implement evaluate**

`src/geometry/evaluate.ts`:

```ts
import type { Colour, Document, Layer, ShapeConfig, StyleConfig } from '../document/schema'
import { rootContext, type EvalContext } from './context'
import { isModulated, resolve, type Field } from './field'
import type { EvaluationResult, Instance, ResolvedColour, ResolvedStyle } from './instance'
import type { Path } from './path'
import { getRepeater, type Placement } from './repeaters'
import { ellipse, polygon } from './shapes'
import { compose, IDENTITY } from './transform'

function shapeFields(shape: ShapeConfig): Field[] {
  return shape.type === 'polygon'
    ? [shape.sides, shape.radius, shape.rotation]
    : [shape.rx, shape.ry, shape.rotation]
}

function isConstantShape(shape: ShapeConfig): boolean {
  return shapeFields(shape).every((f) => !isModulated(f))
}

function buildShape(shape: ShapeConfig, ctx: EvalContext): Path {
  if (shape.type === 'polygon') {
    return polygon(resolve(shape.sides, ctx), resolve(shape.radius, ctx), resolve(shape.rotation, ctx))
  }
  return ellipse(resolve(shape.rx, ctx), resolve(shape.ry, ctx), resolve(shape.rotation, ctx))
}

function resolveColour(colour: Colour, ctx: EvalContext): ResolvedColour {
  return {
    l: resolve(colour.l, ctx),
    c: resolve(colour.c, ctx),
    h: resolve(colour.h, ctx),
    a: resolve(colour.a, ctx),
  }
}

function resolveStyle(style: StyleConfig, ctx: EvalContext): ResolvedStyle {
  const out: ResolvedStyle = {}
  if (style.fill) out.fill = resolveColour(style.fill, ctx)
  if (style.stroke) {
    out.stroke = {
      colour: resolveColour(style.stroke.colour, ctx),
      width: resolve(style.stroke.width, ctx),
    }
  }
  return out
}

/** Expands a layer's repeater chain, stopping at `budget` placements. */
function expandChain(layer: Layer, budget: number): { nodes: Placement[]; truncated: boolean } {
  let nodes: Placement[] = [{ transform: IDENTITY, ctx: rootContext() }]
  let truncated = false

  for (const config of layer.repeaters) {
    const repeater = getRepeater(config.type)
    const next: Placement[] = []
    outer: for (const node of nodes) {
      for (const child of repeater.expand(config, node.ctx)) {
        if (next.length >= budget) {
          truncated = true
          break outer
        }
        next.push({ transform: compose(node.transform, child.transform), ctx: child.ctx })
      }
    }
    nodes = next
  }

  if (nodes.length > budget) {
    nodes = nodes.slice(0, budget)
    truncated = true
  }
  return { nodes, truncated }
}

export function evaluate(doc: Document): EvaluationResult {
  const layers: EvaluationResult['layers'] = []
  const perLayerCounts: Record<string, number> = {}
  let totalInstances = 0
  let truncated = false

  for (const layer of doc.layers) {
    const budget = doc.maxInstances - totalInstances

    if (!layer.visible || budget <= 0) {
      if (layer.visible) truncated = true
      perLayerCounts[layer.id] = 0
      layers.push({ layerId: layer.id, instances: [] })
      continue
    }

    const expansion = expandChain(layer, budget)
    if (expansion.truncated) truncated = true

    const total = expansion.nodes.length
    const sharedPath = isConstantShape(layer.shape) ? buildShape(layer.shape, rootContext()) : null

    const instances: Instance[] = expansion.nodes.map((node, i) => {
      const ctx: EvalContext = { ...node.ctx, flatIndex: i, total }
      return {
        path: sharedPath ?? buildShape(layer.shape, ctx),
        transform: node.transform,
        style: resolveStyle(layer.style, ctx),
      }
    })

    perLayerCounts[layer.id] = instances.length
    totalInstances += instances.length
    layers.push({ layerId: layer.id, instances })
  }

  return { layers, totalInstances, truncated, perLayerCounts }
}
```

- [ ] **Step 5: Run and watch it pass**

Run: `npm test`
Expected: PASS, all suites.

- [ ] **Step 6: Commit**

```bash
git add src/geometry
git commit -m "feat: evaluate() turns a document into instances"
```

---

### Task 9: OKLCH colour to CSS

**Files:**
- Create: `src/render/colour.ts`
- Test: `src/render/colour.test.ts`

**Interfaces:**
- Consumes: `ResolvedColour` (type-only) from `../geometry/instance`.
- Produces: `colourToCss(colour)`, `createColourCache(): (colour: ResolvedColour) => string`.

- [ ] **Step 1: Write the failing test**

`src/render/colour.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { colourToCss, createColourCache } from './colour'

describe('colourToCss', () => {
  it('formats an oklch string with alpha', () => {
    expect(colourToCss({ l: 0.62, c: 0.18, h: 280, a: 0.35 })).toBe('oklch(62% 0.18 280 / 0.35)')
  })

  it('clamps lightness and alpha into range', () => {
    expect(colourToCss({ l: 1.5, c: 0.1, h: 0, a: -1 })).toBe('oklch(100% 0.1 0 / 0)')
  })

  it('wraps hue into 0..360', () => {
    expect(colourToCss({ l: 0.5, c: 0.1, h: 400, a: 1 })).toBe('oklch(50% 0.1 40 / 1)')
    expect(colourToCss({ l: 0.5, c: 0.1, h: -20, a: 1 })).toBe('oklch(50% 0.1 340 / 1)')
  })

  it('clamps negative chroma to zero', () => {
    expect(colourToCss({ l: 0.5, c: -0.4, h: 10, a: 1 })).toBe('oklch(50% 0 10 / 1)')
  })
})

describe('createColourCache', () => {
  it('returns the identical string instance for equal colours', () => {
    const cache = createColourCache()
    const a = cache({ l: 0.6, c: 0.2, h: 100, a: 0.5 })
    const b = cache({ l: 0.6, c: 0.2, h: 100, a: 0.5 })
    expect(a).toBe(b)
    expect(a).toBe('oklch(60% 0.2 100 / 0.5)')
  })

  it('quantises near-identical colours to the same entry', () => {
    const cache = createColourCache()
    expect(cache({ l: 0.60001, c: 0.2, h: 100, a: 0.5 })).toBe(
      cache({ l: 0.60002, c: 0.2, h: 100, a: 0.5 }),
    )
  })

  it('keeps visibly different colours distinct', () => {
    const cache = createColourCache()
    expect(cache({ l: 0.6, c: 0.2, h: 100, a: 0.5 })).not.toBe(
      cache({ l: 0.6, c: 0.2, h: 140, a: 0.5 }),
    )
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/render/colour.test.ts`
Expected: FAIL — cannot resolve `./colour`.

- [ ] **Step 3: Implement**

`src/render/colour.ts`:

```ts
import type { ResolvedColour } from '../geometry/instance'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const trim = (v: number) => String(Number(v.toFixed(4)))

export function colourToCss(colour: ResolvedColour): string {
  const l = trim(clamp(colour.l, 0, 1) * 100)
  const c = trim(clamp(colour.c, 0, 0.5))
  const h = trim(((colour.h % 360) + 360) % 360)
  const a = trim(clamp(colour.a, 0, 1))
  return `oklch(${l}% ${c} ${h} / ${a})`
}

/**
 * Building an oklch() string per instance per frame is real garbage pressure at
 * 50k instances, so quantise and memoise: tens of thousands of instances rarely
 * need more than a few hundred distinct colours.
 */
export function createColourCache(): (colour: ResolvedColour) => string {
  const cache = new Map<string, string>()
  return (colour) => {
    const key = `${colour.l.toFixed(3)}|${colour.c.toFixed(3)}|${colour.h.toFixed(1)}|${colour.a.toFixed(3)}`
    let css = cache.get(key)
    if (css === undefined) {
      css = colourToCss(colour)
      cache.set(key, css)
    }
    return css
  }
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test -- src/render`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render
git commit -m "feat: OKLCH colour to CSS with memoisation"
```

---

### Task 10: Renderer interface, Path2D cache and the Canvas 2D backend

**Files:**
- Create: `src/render/path2d.ts`, `src/render/renderer.ts`, `src/render/fake.ts`, `src/render/canvas2d.ts`
- Test: `src/render/path2d.test.ts`, `src/render/canvas2d.test.ts`

**Interfaces:**
- Consumes: `Instance`, `ResolvedColour`, `Path` (type-only); `Mat2D`, `compose`, `scale`, `translate`; `createColourCache`.
- Produces:
  - `type Viewport = { pan: { x: number; y: number }; zoom: number }`, `DEFAULT_VIEWPORT`
  - `type SceneLayer = { instances: Instance[] }`, `type Scene = { background: ResolvedColour; width: number; height: number; layers: SceneLayer[] }`
  - `interface Renderer { resize(w, h, dpr): void; draw(scene, viewport): void }`
  - `type Path2DLike`, `type Path2DFactory`, `createPath2DCache(factory)`, `browserPath2D`
  - `type DrawContext` (the subset of `CanvasRenderingContext2D` used)
  - `class Canvas2DRenderer implements Renderer` — constructed as `new Canvas2DRenderer(ctx, toPath)`
  - `createCanvasRenderer(canvas: HTMLCanvasElement): Canvas2DRenderer`
  - `class FakeRenderer implements Renderer` with a `calls` array

`DrawContext` is hand-written rather than the DOM type so tests can pass a plain recording object. `Path2DLike` is `object` because the geometry layer must never see a `Path2D`.

- [ ] **Step 1: Write the failing tests**

`src/render/path2d.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { createPath2DCache } from './path2d'
import type { Path } from '../geometry/path'

const path: Path = { segments: [{ c: 'M', p: { x: 0, y: 0 } }, { c: 'Z' }] }

describe('createPath2DCache', () => {
  it('builds once per Path object identity', () => {
    const factory = vi.fn(() => ({}))
    const cached = createPath2DCache(factory)
    const a = cached(path)
    const b = cached(path)
    expect(a).toBe(b)
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('builds again for a different Path object', () => {
    const factory = vi.fn(() => ({}))
    const cached = createPath2DCache(factory)
    cached(path)
    cached({ segments: [...path.segments] })
    expect(factory).toHaveBeenCalledTimes(2)
  })
})
```

`src/render/canvas2d.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { Canvas2DRenderer } from './canvas2d'
import { DEFAULT_VIEWPORT, type Scene } from './renderer'
import type { Instance } from '../geometry/instance'
import { IDENTITY, translate } from '../geometry/transform'
import type { Path } from '../geometry/path'

const path: Path = { segments: [{ c: 'M', p: { x: 0, y: 0 } }, { c: 'Z' }] }

function instance(over: Partial<Instance> = {}): Instance {
  return {
    path,
    transform: IDENTITY,
    style: { fill: { l: 0.6, c: 0.2, h: 100, a: 0.5 } },
    ...over,
  }
}

function fakeContext() {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  }
}

function scene(over: Partial<Scene> = {}): Scene {
  return {
    background: { l: 1, c: 0, h: 0, a: 1 },
    width: 200,
    height: 100,
    layers: [{ instances: [instance()] }],
    ...over,
  }
}

describe('Canvas2DRenderer', () => {
  it('clears and paints the background before drawing', () => {
    const ctx = fakeContext()
    new Canvas2DRenderer(ctx, () => ({})).draw(scene(), DEFAULT_VIEWPORT)
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 200, 100)
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 200, 100)
  })

  it('fills once per instance', () => {
    const ctx = fakeContext()
    const layers = [{ instances: [instance(), instance(), instance()] }]
    new Canvas2DRenderer(ctx, () => ({})).draw(scene({ layers }), DEFAULT_VIEWPORT)
    expect(ctx.fill).toHaveBeenCalledTimes(3)
  })

  it('reuses one Path2D across instances that share a Path object', () => {
    const ctx = fakeContext()
    const factory = vi.fn(() => ({}))
    const layers = [{ instances: [instance(), instance(), instance()] }]
    new Canvas2DRenderer(ctx, factory).draw(scene({ layers }), DEFAULT_VIEWPORT)
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('draws layers in painter order, bottom first', () => {
    const ctx = fakeContext()
    const order: string[] = []
    ctx.fill.mockImplementation(() => order.push(ctx.fillStyle))
    const layers = [
      { instances: [instance({ style: { fill: { l: 0.1, c: 0, h: 0, a: 1 } } })] },
      { instances: [instance({ style: { fill: { l: 0.9, c: 0, h: 0, a: 1 } } })] },
    ]
    new Canvas2DRenderer(ctx, () => ({})).draw(scene({ layers }), DEFAULT_VIEWPORT)
    expect(order).toEqual(['oklch(10% 0 0 / 1)', 'oklch(90% 0 0 / 1)'])
  })

  it('centres the document origin and applies pan, zoom and dpr', () => {
    const ctx = fakeContext()
    const renderer = new Canvas2DRenderer(ctx, () => ({}))
    renderer.resize(200, 100, 2)
    const layers = [{ instances: [instance({ transform: translate(10, 0) })] }]
    renderer.draw(scene({ layers }), { pan: { x: 5, y: 0 }, zoom: 3 })
    // last setTransform call is the instance: dpr * (centre + pan + zoom * local)
    const last = ctx.setTransform.mock.calls.at(-1)
    expect(last).toEqual([6, 0, 0, 6, 2 * (100 + 5 + 3 * 10), 2 * 50])
  })

  it('skips instances with no fill and no stroke', () => {
    const ctx = fakeContext()
    const layers = [{ instances: [instance({ style: {} })] }]
    new Canvas2DRenderer(ctx, () => ({})).draw(scene({ layers }), DEFAULT_VIEWPORT)
    expect(ctx.fill).not.toHaveBeenCalled()
  })

  it('strokes when a stroke style is present', () => {
    const ctx = fakeContext()
    const style = { stroke: { colour: { l: 0.2, c: 0, h: 0, a: 1 }, width: 4 } }
    const layers = [{ instances: [instance({ style })] }]
    new Canvas2DRenderer(ctx, () => ({})).draw(scene({ layers }), DEFAULT_VIEWPORT)
    expect(ctx.stroke).toHaveBeenCalledTimes(1)
    expect(ctx.lineWidth).toBe(4)
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npm test -- src/render`
Expected: FAIL — `./path2d`, `./renderer`, `./canvas2d` not found.

- [ ] **Step 3: Implement the Path2D cache**

`src/render/path2d.ts`:

```ts
import type { Path } from '../geometry/path'

/** Opaque to everything but the renderer — geometry must never see a Path2D. */
export type Path2DLike = object
export type Path2DFactory = (path: Path) => Path2DLike

/** Caches by Path object identity, which is why evaluate() shares one Path across instances. */
export function createPath2DCache(factory: Path2DFactory): Path2DFactory {
  const cache = new WeakMap<Path, Path2DLike>()
  return (path) => {
    let built = cache.get(path)
    if (built === undefined) {
      built = factory(path)
      cache.set(path, built)
    }
    return built
  }
}

export const browserPath2D: Path2DFactory = (path) => {
  const out = new Path2D()
  for (const seg of path.segments) {
    switch (seg.c) {
      case 'M':
        out.moveTo(seg.p.x, seg.p.y)
        break
      case 'L':
        out.lineTo(seg.p.x, seg.p.y)
        break
      case 'C':
        out.bezierCurveTo(seg.c1.x, seg.c1.y, seg.c2.x, seg.c2.y, seg.p.x, seg.p.y)
        break
      case 'Z':
        out.closePath()
        break
    }
  }
  return out
}
```

- [ ] **Step 4: Implement the renderer interface and the fake**

`src/render/renderer.ts`:

```ts
import type { Instance, ResolvedColour } from '../geometry/instance'

export type Viewport = { pan: { x: number; y: number }; zoom: number }

export const DEFAULT_VIEWPORT: Viewport = { pan: { x: 0, y: 0 }, zoom: 1 }

/** Phase 3 adds blend, opacity and mask to this type. */
export type SceneLayer = { instances: Instance[] }

export type Scene = {
  background: ResolvedColour
  width: number
  height: number
  layers: SceneLayer[]
}

export interface Renderer {
  resize(width: number, height: number, dpr: number): void
  draw(scene: Scene, viewport: Viewport): void
}
```

`src/render/fake.ts`:

```ts
import type { Renderer, Scene, Viewport } from './renderer'

export class FakeRenderer implements Renderer {
  calls: { type: 'resize' | 'draw'; scene?: Scene; viewport?: Viewport; size?: number[] }[] = []

  resize(width: number, height: number, dpr: number): void {
    this.calls.push({ type: 'resize', size: [width, height, dpr] })
  }

  draw(scene: Scene, viewport: Viewport): void {
    this.calls.push({ type: 'draw', scene, viewport })
  }

  get drawCount(): number {
    return this.calls.filter((c) => c.type === 'draw').length
  }

  get lastScene(): Scene | undefined {
    return this.calls.filter((c) => c.type === 'draw').at(-1)?.scene
  }
}
```

- [ ] **Step 5: Implement the Canvas 2D backend**

`src/render/canvas2d.ts`:

```ts
import { compose, scale, translate, type Mat2D } from '../geometry/transform'
import { createColourCache } from './colour'
import { browserPath2D, createPath2DCache, type Path2DFactory, type Path2DLike } from './path2d'
import type { Renderer, Scene, Viewport } from './renderer'

/** The subset of CanvasRenderingContext2D this renderer uses. */
export type DrawContext = {
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  clearRect(x: number, y: number, w: number, h: number): void
  fillRect(x: number, y: number, w: number, h: number): void
  fill(path: Path2DLike): void
  stroke(path: Path2DLike): void
}

export class Canvas2DRenderer implements Renderer {
  private dpr = 1
  private readonly colour = createColourCache()
  private readonly toPath: Path2DFactory

  constructor(
    private readonly ctx: DrawContext,
    pathFactory: Path2DFactory,
  ) {
    this.toPath = createPath2DCache(pathFactory)
  }

  resize(_width: number, _height: number, dpr: number): void {
    this.dpr = dpr
  }

  draw(scene: Scene, viewport: Viewport): void {
    const { ctx, dpr } = this
    const device = scale(dpr, dpr)

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, scene.width, scene.height)
    ctx.fillStyle = this.colour(scene.background)
    ctx.fillRect(0, 0, scene.width, scene.height)

    // Document space has its origin at the centre of the canvas.
    const world = compose(
      translate(scene.width / 2 + viewport.pan.x, scene.height / 2 + viewport.pan.y),
      scale(viewport.zoom, viewport.zoom),
    )

    for (const layer of scene.layers) {
      for (const inst of layer.instances) {
        if (!inst.style.fill && !inst.style.stroke) continue
        const m: Mat2D = compose(device, compose(world, inst.transform))
        ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5])
        const path = this.toPath(inst.path)
        if (inst.style.fill) {
          ctx.fillStyle = this.colour(inst.style.fill)
          ctx.fill(path)
        }
        if (inst.style.stroke) {
          ctx.strokeStyle = this.colour(inst.style.stroke.colour)
          ctx.lineWidth = inst.style.stroke.width
          ctx.stroke(path)
        }
      }
    }
  }
}

export function createCanvasRenderer(canvas: HTMLCanvasElement): Canvas2DRenderer {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not acquire a 2D context')
  return new Canvas2DRenderer(ctx as unknown as DrawContext, browserPath2D)
}
```

- [ ] **Step 6: Run and watch them pass**

Run: `npm test -- src/render`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/render
git commit -m "feat: renderer interface, Path2D cache and Canvas 2D backend"
```

---

### Task 11: Document operations

**Files:**
- Create: `src/document/ops.ts`
- Test: `src/document/ops.test.ts`

**Interfaces:**
- Consumes: `Document`, `Layer`, `LayerId`, `ShapeConfig`, `Colour` (types); `defaultLayer`, `newId`.
- Produces: `addLayer(doc, name?)`, `removeLayer(doc, id)`, `duplicateLayer(doc, id)`, `moveLayer(doc, id, delta)`, `renameLayer(doc, id, name)`, `setLayerVisible(doc, id, visible)`, `updateLayer(doc, id, fn)`, `setShapeType(doc, id, type)`, `setCanvasSize(doc, w, h)`. Every function returns a **new** document.

- [ ] **Step 1: Write the failing test**

`src/document/ops.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { emptyDocument } from './defaults'
import {
  addLayer, removeLayer, duplicateLayer, moveLayer, renameLayer,
  setLayerVisible, updateLayer, setShapeType, setCanvasSize,
} from './ops'

const withLayer = () => addLayer(emptyDocument(), 'halo')

describe('document ops', () => {
  it('never mutates the input document', () => {
    const before = emptyDocument()
    const snapshot = JSON.stringify(before)
    addLayer(before, 'halo')
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('adds a layer on top', () => {
    const doc = addLayer(withLayer(), 'second')
    expect(doc.layers.map((l) => l.name)).toEqual(['halo', 'second'])
  })

  it('removes a layer by id', () => {
    const doc = withLayer()
    expect(removeLayer(doc, doc.layers[0].id).layers).toHaveLength(0)
  })

  it('leaves the document alone when removing an unknown id', () => {
    const doc = withLayer()
    expect(removeLayer(doc, 'nope').layers).toHaveLength(1)
  })

  it('duplicates a layer with a fresh id, directly above the original', () => {
    const doc = withLayer()
    const dup = duplicateLayer(doc, doc.layers[0].id)
    expect(dup.layers).toHaveLength(2)
    expect(dup.layers[1].id).not.toBe(dup.layers[0].id)
    expect(dup.layers[1].name).toBe('halo copy')
  })

  it('leaves the document alone when duplicating an unknown id', () => {
    const doc = withLayer()
    expect(duplicateLayer(doc, 'nope')).toBe(doc)
  })

  it('moves a layer up and down, clamping at the ends', () => {
    let doc = addLayer(withLayer(), 'second')
    const bottomId = doc.layers[0].id
    doc = moveLayer(doc, bottomId, 1)
    expect(doc.layers.map((l) => l.name)).toEqual(['second', 'halo'])
    doc = moveLayer(doc, bottomId, 5)
    expect(doc.layers.map((l) => l.name)).toEqual(['second', 'halo'])
  })

  it('renames and toggles visibility', () => {
    const doc = withLayer()
    const id = doc.layers[0].id
    expect(renameLayer(doc, id, 'ring').layers[0].name).toBe('ring')
    expect(setLayerVisible(doc, id, false).layers[0].visible).toBe(false)
  })

  it('updates one layer through a callback', () => {
    const doc = withLayer()
    const id = doc.layers[0].id
    const out = updateLayer(doc, id, (l) => ({ ...l, opacity: 0.5 }))
    expect(out.layers[0].opacity).toBe(0.5)
  })

  it('swaps shape type to a valid default of the new type', () => {
    const doc = withLayer()
    const out = setShapeType(doc, doc.layers[0].id, 'ellipse')
    expect(out.layers[0].shape).toEqual({ type: 'ellipse', rx: 60, ry: 40, rotation: 0 })
  })

  it('sets the canvas size', () => {
    expect(setCanvasSize(emptyDocument(), 800, 600).canvas).toMatchObject({ width: 800, height: 600 })
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/document/ops.test.ts`
Expected: FAIL — cannot resolve `./ops`.

- [ ] **Step 3: Implement**

`src/document/ops.ts`:

```ts
import { defaultLayer, newId } from './defaults'
import type { Document, Layer, LayerId, ShapeConfig, ShapeType } from './schema'

const DEFAULT_SHAPES: Record<ShapeType, ShapeConfig> = {
  polygon: { type: 'polygon', sides: 6, radius: 60, rotation: 0 },
  ellipse: { type: 'ellipse', rx: 60, ry: 40, rotation: 0 },
}

export function addLayer(doc: Document, name = 'layer'): Document {
  return { ...doc, layers: [...doc.layers, defaultLayer(name)] }
}

export function removeLayer(doc: Document, id: LayerId): Document {
  return { ...doc, layers: doc.layers.filter((l) => l.id !== id) }
}

export function duplicateLayer(doc: Document, id: LayerId): Document {
  const index = doc.layers.findIndex((l) => l.id === id)
  if (index === -1) return doc
  const source = doc.layers[index]
  const copy: Layer = structuredClone({ ...source, id: newId(), name: `${source.name} copy` })
  const layers = [...doc.layers]
  layers.splice(index + 1, 0, copy)
  return { ...doc, layers }
}

export function moveLayer(doc: Document, id: LayerId, delta: number): Document {
  const from = doc.layers.findIndex((l) => l.id === id)
  if (from === -1) return doc
  const to = Math.min(doc.layers.length - 1, Math.max(0, from + delta))
  if (to === from) return doc
  const layers = [...doc.layers]
  const [moved] = layers.splice(from, 1)
  layers.splice(to, 0, moved)
  return { ...doc, layers }
}

export function updateLayer(
  doc: Document,
  id: LayerId,
  fn: (layer: Layer) => Layer,
): Document {
  return { ...doc, layers: doc.layers.map((l) => (l.id === id ? fn(l) : l)) }
}

export function renameLayer(doc: Document, id: LayerId, name: string): Document {
  return updateLayer(doc, id, (l) => ({ ...l, name }))
}

export function setLayerVisible(doc: Document, id: LayerId, visible: boolean): Document {
  return updateLayer(doc, id, (l) => ({ ...l, visible }))
}

export function setShapeType(doc: Document, id: LayerId, type: ShapeType): Document {
  return updateLayer(doc, id, (l) => ({ ...l, shape: structuredClone(DEFAULT_SHAPES[type]) }))
}

export function setCanvasSize(doc: Document, width: number, height: number): Document {
  return { ...doc, canvas: { ...doc.canvas, width, height } }
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test -- src/document`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/document
git commit -m "feat: pure document operations"
```

---

### Task 12: zustand store

**Files:**
- Create: `src/state/store.ts`
- Test: `src/state/store.test.ts`

**Interfaces:**
- Consumes: `Document`, `LayerId`; `emptyDocument`, `addLayer`; `Viewport`, `DEFAULT_VIEWPORT`.
- Produces: `useStore` (zustand hook) with state `{ doc, selectedLayerId, viewport, isDragging }` and actions `apply(fn)`, `setDoc(doc)`, `select(id)`, `setViewport(v)`, `setDragging(b)`, `addAndSelectLayer(name?)`.

Selecting a layer that no longer exists must fall back to `null`, otherwise the inspector renders against a ghost.

- [ ] **Step 1: Write the failing test**

`src/state/store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from './store'
import { emptyDocument } from '../document/defaults'
import { removeLayer } from '../document/ops'

describe('store', () => {
  beforeEach(() => {
    useStore.setState({
      doc: emptyDocument(),
      selectedLayerId: null,
      viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
      isDragging: false,
    })
  })

  it('starts with an empty document and nothing selected', () => {
    expect(useStore.getState().doc.layers).toEqual([])
    expect(useStore.getState().selectedLayerId).toBeNull()
  })

  it('adds a layer and selects it', () => {
    useStore.getState().addAndSelectLayer('halo')
    const { doc, selectedLayerId } = useStore.getState()
    expect(doc.layers).toHaveLength(1)
    expect(selectedLayerId).toBe(doc.layers[0].id)
  })

  it('applies a pure op', () => {
    useStore.getState().addAndSelectLayer('halo')
    const id = useStore.getState().doc.layers[0].id
    useStore.getState().apply((d) => removeLayer(d, id))
    expect(useStore.getState().doc.layers).toEqual([])
  })

  it('clears the selection when the selected layer disappears', () => {
    useStore.getState().addAndSelectLayer('halo')
    const id = useStore.getState().doc.layers[0].id
    useStore.getState().apply((d) => removeLayer(d, id))
    expect(useStore.getState().selectedLayerId).toBeNull()
  })

  it('tracks viewport and drag state', () => {
    useStore.getState().setViewport({ pan: { x: 4, y: 5 }, zoom: 2 })
    useStore.getState().setDragging(true)
    expect(useStore.getState().viewport.zoom).toBe(2)
    expect(useStore.getState().isDragging).toBe(true)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/state`
Expected: FAIL — cannot resolve `./store`.

- [ ] **Step 3: Implement**

`src/state/store.ts`:

```ts
import { create } from 'zustand'
import { emptyDocument } from '../document/defaults'
import { addLayer } from '../document/ops'
import type { Document, LayerId } from '../document/schema'
import { DEFAULT_VIEWPORT, type Viewport } from '../render/renderer'

type State = {
  doc: Document
  selectedLayerId: LayerId | null
  viewport: Viewport
  isDragging: boolean

  apply: (fn: (doc: Document) => Document) => void
  setDoc: (doc: Document) => void
  select: (id: LayerId | null) => void
  setViewport: (viewport: Viewport) => void
  setDragging: (isDragging: boolean) => void
  addAndSelectLayer: (name?: string) => void
}

/** Keeps the selection honest: a layer that no longer exists cannot stay selected. */
function reconcileSelection(doc: Document, selected: LayerId | null): LayerId | null {
  return selected !== null && doc.layers.some((l) => l.id === selected) ? selected : null
}

export const useStore = create<State>((set) => ({
  doc: emptyDocument(),
  selectedLayerId: null,
  viewport: DEFAULT_VIEWPORT,
  isDragging: false,

  apply: (fn) =>
    set((state) => {
      const doc = fn(state.doc)
      return { doc, selectedLayerId: reconcileSelection(doc, state.selectedLayerId) }
    }),

  setDoc: (doc) => set((state) => ({ doc, selectedLayerId: reconcileSelection(doc, state.selectedLayerId) })),

  select: (selectedLayerId) => set({ selectedLayerId }),
  setViewport: (viewport) => set({ viewport }),
  setDragging: (isDragging) => set({ isDragging }),

  addAndSelectLayer: (name = 'layer') =>
    set((state) => {
      const doc = addLayer(state.doc, name)
      return { doc, selectedLayerId: doc.layers.at(-1)!.id }
    }),
}))
```

- [ ] **Step 4: Run and watch it pass**

Run: `npm test -- src/state`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state
git commit -m "feat: zustand store with selection reconciliation"
```

---

### Task 13: Scene building, evaluation hook and top bar

**Files:**
- Create: `src/render/scene.ts`, `src/ui/useEvaluation.ts`, `src/ui/TopBar.tsx`
- Modify: `src/ui/App.tsx`
- Test: `src/render/scene.test.ts`, `src/ui/TopBar.test.tsx`

**Interfaces:**
- Consumes: `Document`, `EvaluationResult`, `evaluate`, `Scene`, `useStore`, `setCanvasSize`.
- Produces:
  - `buildScene(doc, result): Scene` — pure; pairs each layer's instances with the document background and canvas size.
  - `useEvaluation(): EvaluationResult` — memoised on document identity.
  - `TopBar` component.

- [ ] **Step 1: Write the failing tests**

`src/render/scene.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildScene } from './scene'
import { evaluate } from '../geometry/evaluate'
import { emptyDocument, defaultLayer } from '../document/defaults'

describe('buildScene', () => {
  it('carries canvas size and background through', () => {
    const doc = emptyDocument()
    const scene = buildScene(doc, evaluate(doc))
    expect(scene.width).toBe(1200)
    expect(scene.height).toBe(1200)
    expect(scene.background).toEqual({ l: 0.98, c: 0.005, h: 250, a: 1 })
  })

  it('keeps layers separate and in painter order', () => {
    const doc = emptyDocument()
    doc.layers.push(defaultLayer('bottom'), defaultLayer('top'))
    doc.layers[0].repeaters[0].count = 3
    doc.layers[1].repeaters[0].count = 5
    const scene = buildScene(doc, evaluate(doc))
    expect(scene.layers.map((l) => l.instances.length)).toEqual([3, 5])
  })

  it('resolves a modulated background channel against the root context', () => {
    const doc = emptyDocument()
    doc.canvas.background = { l: 0.2, c: 0.05, h: 260, a: 1 }
    expect(buildScene(doc, evaluate(doc)).background.l).toBe(0.2)
  })
})
```

`src/ui/TopBar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import TopBar from './TopBar'
import { useStore } from '../state/store'
import { emptyDocument, defaultLayer } from '../document/defaults'

describe('TopBar', () => {
  beforeEach(() => {
    const doc = emptyDocument()
    doc.layers.push(defaultLayer('halo'))
    useStore.setState({ doc, selectedLayerId: null })
  })

  it('shows the total instance count', () => {
    render(<TopBar />)
    expect(screen.getByTestId('instance-count').textContent).toContain('12')
  })

  it('edits the canvas width', () => {
    render(<TopBar />)
    fireEvent.change(screen.getByLabelText('Canvas width'), { target: { value: '800' } })
    expect(useStore.getState().doc.canvas.width).toBe(800)
  })

  it('warns when the instance budget truncates', () => {
    useStore.setState((s) => ({ doc: { ...s.doc, maxInstances: 5 } }))
    render(<TopBar />)
    expect(screen.getByTestId('truncation-warning')).toBeDefined()
  })

  it('shows no warning when everything fits', () => {
    render(<TopBar />)
    expect(screen.queryByTestId('truncation-warning')).toBeNull()
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npm test -- src/render/scene.test.ts src/ui/TopBar.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement scene building and the evaluation hook**

`src/render/scene.ts`:

```ts
import { rootContext } from '../geometry/context'
import { resolve } from '../geometry/field'
import type { EvaluationResult, ResolvedColour } from '../geometry/instance'
import type { Colour, Document } from '../document/schema'
import type { Scene } from './renderer'

function resolveStatic(colour: Colour): ResolvedColour {
  const ctx = rootContext()
  return {
    l: resolve(colour.l, ctx),
    c: resolve(colour.c, ctx),
    h: resolve(colour.h, ctx),
    a: resolve(colour.a, ctx),
  }
}

export function buildScene(doc: Document, result: EvaluationResult): Scene {
  return {
    background: resolveStatic(doc.canvas.background),
    width: doc.canvas.width,
    height: doc.canvas.height,
    layers: result.layers.map((l) => ({ instances: l.instances })),
  }
}
```

`src/ui/useEvaluation.ts`:

```ts
import { useMemo } from 'react'
import { evaluate } from '../geometry/evaluate'
import type { EvaluationResult } from '../geometry/instance'
import { useStore } from '../state/store'

/** Re-evaluates only when the document object identity changes. */
export function useEvaluation(): EvaluationResult {
  const doc = useStore((s) => s.doc)
  return useMemo(() => evaluate(doc), [doc])
}
```

- [ ] **Step 4: Implement the top bar**

`src/ui/TopBar.tsx`:

```tsx
import { setCanvasSize } from '../document/ops'
import { useStore } from '../state/store'
import { useEvaluation } from './useEvaluation'

export default function TopBar() {
  const doc = useStore((s) => s.doc)
  const apply = useStore((s) => s.apply)
  const result = useEvaluation()

  const setSize = (width: number, height: number) =>
    apply((d) => setCanvasSize(d, Math.max(1, width), Math.max(1, height)))

  return (
    <header className="flex items-center gap-4 border-b border-neutral-800 px-3 py-2 text-xs">
      <span className="font-semibold tracking-wide">geo-art</span>

      <label className="flex items-center gap-1 text-neutral-400">
        <span className="sr-only">Canvas width</span>
        <input
          aria-label="Canvas width"
          type="number"
          className="w-16 rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-right text-neutral-100"
          value={doc.canvas.width}
          onChange={(e) => setSize(Number(e.target.value), doc.canvas.height)}
        />
        <span>×</span>
        <input
          aria-label="Canvas height"
          type="number"
          className="w-16 rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-right text-neutral-100"
          value={doc.canvas.height}
          onChange={(e) => setSize(doc.canvas.width, Number(e.target.value))}
        />
      </label>

      <span data-testid="instance-count" className="text-neutral-400">
        {result.totalInstances.toLocaleString()} shapes
      </span>

      {result.truncated && (
        <span data-testid="truncation-warning" className="text-amber-400">
          truncated at {doc.maxInstances.toLocaleString()}
        </span>
      )}
    </header>
  )
}
```

- [ ] **Step 5: Wire the top bar into App**

Replace `src/ui/App.tsx` with:

```tsx
import TopBar from './TopBar'

export default function App() {
  return (
    <div className="flex h-full flex-col bg-neutral-900 text-neutral-100">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <aside data-testid="layers-pane" className="w-52 shrink-0 border-r border-neutral-800" />
        <main data-testid="canvas-pane" className="min-w-0 flex-1" />
        <aside data-testid="inspector-pane" className="w-80 shrink-0 border-l border-neutral-800" />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run and watch them pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/render src/ui
git commit -m "feat: scene building, evaluation hook and top bar"
```

---

### Task 14: Layer list

**Files:**
- Create: `src/ui/LayerList.tsx`
- Modify: `src/ui/App.tsx`
- Test: `src/ui/LayerList.test.tsx`

**Interfaces:**
- Consumes: `useStore`, `useEvaluation`; `removeLayer`, `duplicateLayer`, `moveLayer`, `setLayerVisible` from `../document/ops`.
- Produces: `LayerList` component. Renders layers **top-first** (reverse of the document array, since `layers[0]` is the bottom of the stack).

- [ ] **Step 1: Write the failing test**

`src/ui/LayerList.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import LayerList from './LayerList'
import { useStore } from '../state/store'
import { emptyDocument, defaultLayer } from '../document/defaults'

function seed(names: string[]) {
  const doc = emptyDocument()
  for (const n of names) doc.layers.push(defaultLayer(n))
  useStore.setState({ doc, selectedLayerId: doc.layers[0]?.id ?? null })
  return doc
}

describe('LayerList', () => {
  beforeEach(() => { seed(['bottom', 'top']) })

  it('lists layers top of stack first', () => {
    render(<LayerList />)
    const rows = screen.getAllByTestId('layer-row')
    expect(within(rows[0]).getByText('top')).toBeDefined()
    expect(within(rows[1]).getByText('bottom')).toBeDefined()
  })

  it('shows each layer instance count', () => {
    render(<LayerList />)
    expect(within(screen.getAllByTestId('layer-row')[0]).getByText('12')).toBeDefined()
  })

  it('selects a layer on click', () => {
    render(<LayerList />)
    fireEvent.click(screen.getAllByTestId('layer-row')[0])
    expect(useStore.getState().selectedLayerId).toBe(useStore.getState().doc.layers[1].id)
  })

  it('adds a layer', () => {
    render(<LayerList />)
    fireEvent.click(screen.getByRole('button', { name: 'Add layer' }))
    expect(useStore.getState().doc.layers).toHaveLength(3)
  })

  it('toggles visibility without selecting', () => {
    render(<LayerList />)
    useStore.getState().select(null)
    fireEvent.click(within(screen.getAllByTestId('layer-row')[0]).getByRole('button', { name: 'Toggle visibility' }))
    expect(useStore.getState().doc.layers[1].visible).toBe(false)
    expect(useStore.getState().selectedLayerId).toBeNull()
  })

  it('deletes a layer', () => {
    render(<LayerList />)
    fireEvent.click(within(screen.getAllByTestId('layer-row')[0]).getByRole('button', { name: 'Delete layer' }))
    expect(useStore.getState().doc.layers.map((l) => l.name)).toEqual(['bottom'])
  })

  it('duplicates a layer', () => {
    render(<LayerList />)
    fireEvent.click(within(screen.getAllByTestId('layer-row')[0]).getByRole('button', { name: 'Duplicate layer' }))
    expect(useStore.getState().doc.layers.map((l) => l.name)).toEqual(['bottom', 'top', 'top copy'])
  })

  it('moves a layer up the stack', () => {
    render(<LayerList />)
    fireEvent.click(within(screen.getAllByTestId('layer-row')[1]).getByRole('button', { name: 'Move up' }))
    expect(useStore.getState().doc.layers.map((l) => l.name)).toEqual(['top', 'bottom'])
  })

  it('renders an empty list without crashing', () => {
    seed([])
    render(<LayerList />)
    expect(screen.queryAllByTestId('layer-row')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/ui/LayerList.test.tsx`
Expected: FAIL — cannot resolve `./LayerList`.

- [ ] **Step 3: Implement**

`src/ui/LayerList.tsx`:

```tsx
import { duplicateLayer, moveLayer, removeLayer, setLayerVisible } from '../document/ops'
import { useStore } from '../state/store'
import { useEvaluation } from './useEvaluation'

const iconButton =
  'rounded px-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100'

export default function LayerList() {
  const doc = useStore((s) => s.doc)
  const selectedLayerId = useStore((s) => s.selectedLayerId)
  const apply = useStore((s) => s.apply)
  const select = useStore((s) => s.select)
  const addAndSelectLayer = useStore((s) => s.addAndSelectLayer)
  const result = useEvaluation()

  // layers[0] is the bottom of the stack; show the top first.
  const ordered = [...doc.layers].reverse()

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="flex items-center justify-between border-b border-neutral-800 px-2 py-1.5">
        <span className="font-semibold uppercase tracking-wider text-neutral-500">Layers</span>
        <button
          className={iconButton}
          aria-label="Add layer"
          onClick={() => addAndSelectLayer(`layer ${doc.layers.length + 1}`)}
        >
          +
        </button>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {ordered.map((layer) => (
          <li
            key={layer.id}
            data-testid="layer-row"
            onClick={() => select(layer.id)}
            className={`flex cursor-pointer items-center gap-1 border-b border-neutral-800/60 px-2 py-1.5 ${
              layer.id === selectedLayerId ? 'bg-neutral-800' : 'hover:bg-neutral-800/50'
            }`}
          >
            <button
              className={iconButton}
              aria-label="Toggle visibility"
              onClick={(e) => {
                e.stopPropagation()
                apply((d) => setLayerVisible(d, layer.id, !layer.visible))
              }}
            >
              {layer.visible ? '◉' : '○'}
            </button>

            <span className="min-w-0 flex-1 truncate">{layer.name}</span>
            <span className="tabular-nums text-neutral-500">{result.perLayerCounts[layer.id] ?? 0}</span>

            <button
              className={iconButton}
              aria-label="Move up"
              onClick={(e) => { e.stopPropagation(); apply((d) => moveLayer(d, layer.id, 1)) }}
            >
              ↑
            </button>
            <button
              className={iconButton}
              aria-label="Duplicate layer"
              onClick={(e) => { e.stopPropagation(); apply((d) => duplicateLayer(d, layer.id)) }}
            >
              ⧉
            </button>
            <button
              className={iconButton}
              aria-label="Delete layer"
              onClick={(e) => { e.stopPropagation(); apply((d) => removeLayer(d, layer.id)) }}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Wire it into App**

In `src/ui/App.tsx`, add `import LayerList from './LayerList'` and replace the layers pane:

```tsx
        <aside data-testid="layers-pane" className="w-52 shrink-0 border-r border-neutral-800">
          <LayerList />
        </aside>
```

- [ ] **Step 5: Run and watch it pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui
git commit -m "feat: layer list with add, reorder, duplicate and delete"
```

---

### Task 15: Field descriptors and the stacked-card inspector

**Files:**
- Create: `src/ui/descriptors.ts`, `src/ui/controls/FieldRow.tsx`, `src/ui/Inspector.tsx`
- Modify: `src/document/ops.ts`, `src/document/ops.test.ts`, `src/ui/App.tsx`
- Test: `src/ui/Inspector.test.tsx`

**Interfaces:**
- Consumes: `useStore`, `useEvaluation`, `isModulated`, `ShapeType`, `RepeaterType`.
- Produces:
  - `type FieldDescriptor = { key: string; label: string; min: number; max: number; step?: number; unit?: string }`
  - `SHAPE_FIELDS: Record<ShapeType, FieldDescriptor[]>`, `REPEATER_FIELDS: Record<RepeaterType, FieldDescriptor[]>`, `COLOUR_FIELDS: FieldDescriptor[]`
  - `FieldRow` component
  - `Inspector` component
  - New ops: `setShapeField(doc, id, key, value)`, `setRepeaterField(doc, id, index, key, value)`, `setFillChannel(doc, id, channel, value)`

**This is the task the spec calls out as highest-leverage (spec §10.3):** the inspector walks descriptors rather than hand-writing panels, so a Phase 2 repeater type gets its UI for free.

Phase 1 renders no `~` toggle. A field that *is* modulated (from a loaded file) renders a read-only chip rather than a broken slider.

- [ ] **Step 1: Write the failing ops tests**

Append to `src/document/ops.test.ts`:

```ts
import { setShapeField, setRepeaterField, setFillChannel } from './ops'

describe('field setters', () => {
  const seeded = () => addLayer(emptyDocument(), 'halo')

  it('sets a shape field', () => {
    const doc = seeded()
    const out = setShapeField(doc, doc.layers[0].id, 'sides', 9)
    expect(out.layers[0].shape).toMatchObject({ sides: 9 })
  })

  it('sets a repeater field by chain index', () => {
    const doc = seeded()
    const out = setRepeaterField(doc, doc.layers[0].id, 0, 'count', 24)
    expect(out.layers[0].repeaters[0]).toMatchObject({ count: 24 })
  })

  it('ignores an out-of-range repeater index', () => {
    const doc = seeded()
    expect(setRepeaterField(doc, doc.layers[0].id, 7, 'count', 24)).toEqual(doc)
  })

  it('sets a fill channel', () => {
    const doc = seeded()
    const out = setFillChannel(doc, doc.layers[0].id, 'h', 42)
    expect(out.layers[0].style.fill!.h).toBe(42)
  })

  it('leaves a layer without a fill alone', () => {
    let doc = seeded()
    doc = updateLayer(doc, doc.layers[0].id, (l) => ({ ...l, style: {} }))
    expect(setFillChannel(doc, doc.layers[0].id, 'h', 42).layers[0].style.fill).toBeUndefined()
  })
})
```

- [ ] **Step 2: Write the failing inspector test**

`src/ui/Inspector.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import Inspector from './Inspector'
import { useStore } from '../state/store'
import { emptyDocument, defaultLayer } from '../document/defaults'

function seed() {
  const doc = emptyDocument()
  doc.layers.push(defaultLayer('halo'))
  useStore.setState({ doc, selectedLayerId: doc.layers[0].id })
  return doc
}

describe('Inspector', () => {
  beforeEach(() => { seed() })

  it('prompts when nothing is selected', () => {
    useStore.getState().select(null)
    render(<Inspector />)
    expect(screen.getByTestId('inspector-empty')).toBeDefined()
  })

  it('renders a card per section', () => {
    render(<Inspector />)
    expect(screen.getByTestId('card-shape')).toBeDefined()
    expect(screen.getByTestId('card-repeater-0')).toBeDefined()
    expect(screen.getByTestId('card-style')).toBeDefined()
  })

  it('renders one row per descriptor for the shape type', () => {
    render(<Inspector />)
    expect(screen.getByLabelText('shape sides')).toBeDefined()
    expect(screen.getByLabelText('shape radius')).toBeDefined()
    expect(screen.getByLabelText('shape rotation')).toBeDefined()
  })

  it('scopes labels so a shape and a repeater can share a field name', () => {
    render(<Inspector />)
    // Both the polygon and the radial repeater have a "radius" field.
    expect(screen.getByLabelText('shape radius')).toBeDefined()
    expect(screen.getByLabelText('repeat 1 radius')).toBeDefined()
  })

  it('edits a shape field', () => {
    render(<Inspector />)
    fireEvent.change(screen.getByLabelText('shape sides'), { target: { value: '8' } })
    expect(useStore.getState().doc.layers[0].shape).toMatchObject({ sides: 8 })
  })

  it('edits a repeater field', () => {
    render(<Inspector />)
    fireEvent.change(screen.getByLabelText('repeat 1 count'), { target: { value: '24' } })
    expect(useStore.getState().doc.layers[0].repeaters[0]).toMatchObject({ count: 24 })
  })

  it('edits a colour channel', () => {
    render(<Inspector />)
    fireEvent.change(screen.getByLabelText('fill hue'), { target: { value: '120' } })
    expect(useStore.getState().doc.layers[0].style.fill!.h).toBe(120)
  })

  it('swaps shape type and shows the new type fields', () => {
    render(<Inspector />)
    fireEvent.change(screen.getByLabelText('Shape type'), { target: { value: 'ellipse' } })
    expect(screen.getByLabelText('shape rx')).toBeDefined()
    expect(screen.queryByLabelText('shape sides')).toBeNull()
  })

  it('shows the running instance count on the repeater card', () => {
    render(<Inspector />)
    expect(screen.getByTestId('card-repeater-0').textContent).toContain('12')
  })

  it('renders a modulated field as a read-only chip', () => {
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
    expect(screen.getByTestId('modulated-repeat 1-spin')).toBeDefined()
    expect(screen.queryByLabelText('repeat 1 spin')).toBeNull()
  })
})
```

- [ ] **Step 3: Run both and watch them fail**

Run: `npm test -- src/document/ops.test.ts src/ui/Inspector.test.tsx`
Expected: FAIL — setters and `./Inspector` not found.

- [ ] **Step 4: Add the field setters to ops**

Append to `src/document/ops.ts`:

```ts
import type { Field } from '../geometry/field'

export function setShapeField(
  doc: Document,
  id: LayerId,
  key: string,
  value: Field,
): Document {
  return updateLayer(doc, id, (l) => ({
    ...l,
    shape: { ...l.shape, [key]: value } as ShapeConfig,
  }))
}

export function setRepeaterField(
  doc: Document,
  id: LayerId,
  index: number,
  key: string,
  value: Field,
): Document {
  return updateLayer(doc, id, (l) => {
    if (index < 0 || index >= l.repeaters.length) return l
    const repeaters = l.repeaters.map((r, i) => (i === index ? { ...r, [key]: value } : r))
    return { ...l, repeaters }
  })
}

export function setFillChannel(
  doc: Document,
  id: LayerId,
  channel: 'l' | 'c' | 'h' | 'a',
  value: Field,
): Document {
  return updateLayer(doc, id, (l) =>
    l.style.fill ? { ...l, style: { ...l.style, fill: { ...l.style.fill, [channel]: value } } } : l,
  )
}
```

- [ ] **Step 5: Implement descriptors and FieldRow**

`src/ui/descriptors.ts`:

```ts
import type { RepeaterType } from '../geometry/repeaters'
import type { ShapeType } from '../document/schema'

export type FieldDescriptor = {
  key: string
  label: string
  min: number
  max: number
  step?: number
  unit?: string
}

export const SHAPE_FIELDS: Record<ShapeType, FieldDescriptor[]> = {
  polygon: [
    { key: 'sides', label: 'sides', min: 3, max: 60, step: 1 },
    { key: 'radius', label: 'radius', min: 0, max: 600, unit: 'px' },
    { key: 'rotation', label: 'rotation', min: -360, max: 360, unit: '°' },
  ],
  ellipse: [
    { key: 'rx', label: 'rx', min: 0, max: 600, unit: 'px' },
    { key: 'ry', label: 'ry', min: 0, max: 600, unit: 'px' },
    { key: 'rotation', label: 'rotation', min: -360, max: 360, unit: '°' },
  ],
}

export const REPEATER_FIELDS: Record<RepeaterType, FieldDescriptor[]> = {
  radial: [
    { key: 'count', label: 'count', min: 1, max: 200, step: 1 },
    { key: 'radius', label: 'radius', min: 0, max: 800, unit: 'px' },
    { key: 'startAngle', label: 'start', min: -360, max: 360, unit: '°' },
    { key: 'spin', label: 'spin', min: -360, max: 360, unit: '°' },
  ],
}

export const COLOUR_FIELDS: FieldDescriptor[] = [
  { key: 'l', label: 'lightness', min: 0, max: 1, step: 0.01 },
  { key: 'c', label: 'chroma', min: 0, max: 0.4, step: 0.005 },
  { key: 'h', label: 'hue', min: 0, max: 360, unit: '°' },
  { key: 'a', label: 'alpha', min: 0, max: 1, step: 0.01 },
]
```

`src/ui/controls/FieldRow.tsx`:

```tsx
import { isModulated, type Field } from '../../geometry/field'
import type { FieldDescriptor } from '../descriptors'

type Props = {
  /**
   * Disambiguates fields that share a name across cards — a polygon and a
   * radial repeater both have "radius", and Phase 2's chains will have two
   * "count" fields. Scope makes every id and accessible name unique.
   */
  scope: string
  descriptor: FieldDescriptor
  value: Field
  onChange: (value: number) => void
}

/**
 * Phase 1 edits constants only. A modulated field (from a loaded document)
 * renders as a read-only chip until the Phase 2 modulation editor lands.
 */
export default function FieldRow({ scope, descriptor, value, onChange }: Props) {
  const id = `field-${scope}-${descriptor.key}`
  const accessibleName = `${scope} ${descriptor.label}`

  if (isModulated(value)) {
    return (
      <div
        className="flex items-center gap-2 py-0.5"
        data-testid={`modulated-${scope}-${descriptor.key}`}
      >
        <span className="w-20 shrink-0 text-neutral-400">{descriptor.label}</span>
        <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] text-neutral-400">
          {value.base} → {value.to} · {value.source}
        </span>
      </div>
    )
  }

  const step = descriptor.step ?? 1
  return (
    <div className="flex items-center gap-2 py-0.5">
      <label className="w-20 shrink-0 text-neutral-400" htmlFor={id}>
        {descriptor.label}
      </label>
      <input
        id={id}
        aria-label={accessibleName}
        type="range"
        className="min-w-0 flex-1 accent-sky-500"
        min={descriptor.min}
        max={descriptor.max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="w-12 shrink-0 text-right tabular-nums text-neutral-300">
        {Number(value.toFixed(3))}
        {descriptor.unit === '°' ? '°' : ''}
      </span>
    </div>
  )
}
```

- [ ] **Step 6: Implement the Inspector**

`src/ui/Inspector.tsx`:

```tsx
import { setFillChannel, setRepeaterField, setShapeField, setShapeType } from '../document/ops'
import type { ShapeType } from '../document/schema'
import type { Field } from '../geometry/field'
import { useStore } from '../state/store'
import FieldRow from './controls/FieldRow'
import { COLOUR_FIELDS, REPEATER_FIELDS, SHAPE_FIELDS } from './descriptors'
import { useEvaluation } from './useEvaluation'

const CARD = 'border-b border-neutral-800 px-3 py-2'
const HEADING = 'mb-1 flex items-center text-[10px] font-semibold uppercase tracking-wider text-neutral-500'

export default function Inspector() {
  const doc = useStore((s) => s.doc)
  const selectedLayerId = useStore((s) => s.selectedLayerId)
  const apply = useStore((s) => s.apply)
  const result = useEvaluation()

  const layer = doc.layers.find((l) => l.id === selectedLayerId)

  if (!layer) {
    return (
      <div data-testid="inspector-empty" className="p-3 text-xs text-neutral-500">
        Select a layer to edit it.
      </div>
    )
  }

  const count = result.perLayerCounts[layer.id] ?? 0
  const shapeRecord = layer.shape as unknown as Record<string, Field>

  return (
    <div className="h-full overflow-y-auto text-xs">
      <div className={CARD} data-testid="card-shape">
        <div className={HEADING}>
          Shape
          <select
            aria-label="Shape type"
            className="ml-auto rounded border border-neutral-700 bg-neutral-950 px-1 py-0.5 text-[11px] normal-case tracking-normal text-neutral-100"
            value={layer.shape.type}
            onChange={(e) => apply((d) => setShapeType(d, layer.id, e.target.value as ShapeType))}
          >
            <option value="polygon">polygon</option>
            <option value="ellipse">ellipse</option>
          </select>
        </div>
        {SHAPE_FIELDS[layer.shape.type].map((descriptor) => (
          <FieldRow
            key={descriptor.key}
            scope="shape"
            descriptor={descriptor}
            value={shapeRecord[descriptor.key]}
            onChange={(v) => apply((d) => setShapeField(d, layer.id, descriptor.key, v))}
          />
        ))}
      </div>

      {layer.repeaters.map((repeater, index) => {
        const record = repeater as unknown as Record<string, Field>
        const scope = `repeat ${index + 1}`
        return (
          <div className={CARD} key={index} data-testid={`card-repeater-${index}`}>
            <div className={HEADING}>
              Repeat {index + 1} · {repeater.type}
              <span className="ml-auto tabular-nums normal-case tracking-normal text-neutral-600">
                {count}
              </span>
            </div>
            {REPEATER_FIELDS[repeater.type].map((descriptor) => (
              <FieldRow
                key={descriptor.key}
                scope={scope}
                descriptor={descriptor}
                value={record[descriptor.key]}
                onChange={(v) => apply((d) => setRepeaterField(d, layer.id, index, descriptor.key, v))}
              />
            ))}
          </div>
        )
      })}

      {layer.style.fill && (
        <div className={CARD} data-testid="card-style">
          <div className={HEADING}>Style</div>
          {COLOUR_FIELDS.map((descriptor) => (
            <FieldRow
              key={descriptor.key}
              scope="fill"
              descriptor={descriptor}
              value={layer.style.fill![descriptor.key as 'l' | 'c' | 'h' | 'a']}
              onChange={(v) =>
                apply((d) => setFillChannel(d, layer.id, descriptor.key as 'l' | 'c' | 'h' | 'a', v))
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Wire it into App**

In `src/ui/App.tsx`, add `import Inspector from './Inspector'` and replace the inspector pane:

```tsx
        <aside data-testid="inspector-pane" className="w-80 shrink-0 border-l border-neutral-800">
          <Inspector />
        </aside>
```

- [ ] **Step 8: Run and watch them pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/document src/ui
git commit -m "feat: schema-driven stacked-card inspector"
```

---

### Task 16: Canvas view with pan and zoom

**Files:**
- Create: `src/ui/viewport.ts`, `src/ui/CanvasView.tsx`
- Modify: `src/ui/App.tsx`
- Test: `src/ui/viewport.test.ts`, `src/ui/CanvasView.test.tsx`

**Interfaces:**
- Consumes: `Viewport`, `createCanvasRenderer`, `buildScene`, `useEvaluation`, `useStore`.
- Produces:
  - `fitViewport(canvas: { width: number; height: number }, view: { width: number; height: number }): Viewport`
  - `zoomAt(viewport, factor, pointer, view): Viewport` — keeps the document point under the pointer fixed.
  - `panBy(viewport, dx, dy): Viewport`
  - `CanvasView` component.

The viewport maths lives in a pure module so it can be tested properly; the component is thin glue around it.

- [ ] **Step 1: Write the failing viewport test**

`src/ui/viewport.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fitViewport, zoomAt, panBy } from './viewport'

const view = { width: 800, height: 600 }

describe('fitViewport', () => {
  it('fits by the tighter axis with a margin', () => {
    expect(fitViewport({ width: 1200, height: 1200 }, view).zoom).toBeCloseTo((600 / 1200) * 0.9)
  })

  it('centres the document', () => {
    expect(fitViewport({ width: 1200, height: 1200 }, view).pan).toEqual({ x: 0, y: 0 })
  })

  it('never returns a zero or negative zoom', () => {
    expect(fitViewport({ width: 1200, height: 1200 }, { width: 0, height: 0 }).zoom).toBeGreaterThan(0)
  })
})

describe('zoomAt', () => {
  it('multiplies the zoom', () => {
    const out = zoomAt({ pan: { x: 0, y: 0 }, zoom: 1 }, 2, { x: 400, y: 300 }, view)
    expect(out.zoom).toBe(2)
  })

  it('keeps the document point under the pointer fixed', () => {
    const before = { pan: { x: 10, y: -20 }, zoom: 1.5 }
    const pointer = { x: 250, y: 100 }
    const centre = { x: view.width / 2, y: view.height / 2 }
    const docPoint = {
      x: (pointer.x - centre.x - before.pan.x) / before.zoom,
      y: (pointer.y - centre.y - before.pan.y) / before.zoom,
    }
    const after = zoomAt(before, 1.7, pointer, view)
    expect(centre.x + after.pan.x + after.zoom * docPoint.x).toBeCloseTo(pointer.x, 6)
    expect(centre.y + after.pan.y + after.zoom * docPoint.y).toBeCloseTo(pointer.y, 6)
  })

  it('clamps zoom to a sane range', () => {
    expect(zoomAt({ pan: { x: 0, y: 0 }, zoom: 1 }, 1000, { x: 0, y: 0 }, view).zoom).toBeLessThanOrEqual(64)
    expect(zoomAt({ pan: { x: 0, y: 0 }, zoom: 1 }, 0.00001, { x: 0, y: 0 }, view).zoom).toBeGreaterThanOrEqual(0.02)
  })
})

describe('panBy', () => {
  it('adds to the pan', () => {
    expect(panBy({ pan: { x: 1, y: 2 }, zoom: 1 }, 10, -5).pan).toEqual({ x: 11, y: -3 })
  })
})
```

- [ ] **Step 2: Write the failing component test**

`src/ui/CanvasView.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import CanvasView from './CanvasView'
import { useStore } from '../state/store'
import { emptyDocument, defaultLayer } from '../document/defaults'

beforeEach(() => {
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(),
    fill: vi.fn(), stroke: vi.fn(),
  }
  vi.stubGlobal('Path2D', class { moveTo() {} lineTo() {} bezierCurveTo() {} closePath() {} })
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never
  const doc = emptyDocument()
  doc.layers.push(defaultLayer('halo'))
  useStore.setState({ doc, selectedLayerId: null, viewport: { pan: { x: 0, y: 0 }, zoom: 1 } })
})

describe('CanvasView', () => {
  it('renders a canvas element', () => {
    render(<CanvasView />)
    expect(screen.getByTestId('art-canvas')).toBeDefined()
  })

  it('zooms on wheel', () => {
    render(<CanvasView />)
    const before = useStore.getState().viewport.zoom
    screen.getByTestId('art-canvas').dispatchEvent(
      new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }),
    )
    expect(useStore.getState().viewport.zoom).not.toBe(before)
  })
})
```

- [ ] **Step 3: Run them and watch them fail**

Run: `npm test -- src/ui/viewport.test.ts src/ui/CanvasView.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement the viewport maths**

`src/ui/viewport.ts`:

```ts
import type { Viewport } from '../render/renderer'

const MIN_ZOOM = 0.02
const MAX_ZOOM = 64
const FIT_MARGIN = 0.9

type Size = { width: number; height: number }

export function fitViewport(canvas: Size, view: Size): Viewport {
  const byWidth = view.width / Math.max(1, canvas.width)
  const byHeight = view.height / Math.max(1, canvas.height)
  const raw = Math.min(byWidth, byHeight) * FIT_MARGIN
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, raw || MIN_ZOOM))
  return { pan: { x: 0, y: 0 }, zoom }
}

export function zoomAt(
  viewport: Viewport,
  factor: number,
  pointer: { x: number; y: number },
  view: Size,
): Viewport {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom * factor))
  const cx = view.width / 2
  const cy = view.height / 2
  // The document point currently under the pointer must stay under it.
  const dx = (pointer.x - cx - viewport.pan.x) / viewport.zoom
  const dy = (pointer.y - cy - viewport.pan.y) / viewport.zoom
  return { zoom, pan: { x: pointer.x - cx - zoom * dx, y: pointer.y - cy - zoom * dy } }
}

export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, pan: { x: viewport.pan.x + dx, y: viewport.pan.y + dy } }
}
```

- [ ] **Step 5: Implement the canvas view**

`src/ui/CanvasView.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { buildScene } from '../render/scene'
import { createCanvasRenderer, type Canvas2DRenderer } from '../render/canvas2d'
import { useStore } from '../state/store'
import { useEvaluation } from './useEvaluation'
import { fitViewport, panBy, zoomAt } from './viewport'

export default function CanvasView() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<Canvas2DRenderer | null>(null)
  const frameRef = useRef(0)

  const doc = useStore((s) => s.doc)
  const viewport = useStore((s) => s.viewport)
  const setViewport = useStore((s) => s.setViewport)
  const setDragging = useStore((s) => s.setDragging)
  const result = useEvaluation()

  // Create the renderer once.
  useEffect(() => {
    if (canvasRef.current && !rendererRef.current) {
      rendererRef.current = createCanvasRenderer(canvasRef.current)
    }
  }, [])

  // Redraw on any change, coalesced to one frame.
  useEffect(() => {
    const canvas = canvasRef.current
    const renderer = rendererRef.current
    if (!canvas || !renderer) return

    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1
      const width = canvas.clientWidth || doc.canvas.width
      const height = canvas.clientHeight || doc.canvas.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      renderer.resize(width, height, dpr)
      renderer.draw({ ...buildScene(doc, result), width, height }, viewport)
    })
    return () => cancelAnimationFrame(frameRef.current)
  }, [doc, result, viewport])

  // Redraw when the pane resizes.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => setViewport({ ...useStore.getState().viewport }))
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [setViewport])

  // Fit once, when the canvas first has a size.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    setViewport(
      fitViewport(doc.canvas, {
        width: canvas.clientWidth || doc.canvas.width,
        height: canvas.clientHeight || doc.canvas.height,
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const view = () => ({
    width: canvasRef.current?.clientWidth || doc.canvas.width,
    height: canvasRef.current?.clientHeight || doc.canvas.height,
  })

  return (
    <canvas
      data-testid="art-canvas"
      ref={canvasRef}
      className="h-full w-full cursor-grab"
      onWheel={(e) => {
        e.preventDefault()
        const rect = e.currentTarget.getBoundingClientRect()
        const pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top }
        setViewport(zoomAt(viewport, Math.exp(-e.deltaY * 0.0015), pointer, view()))
      }}
      onPointerDown={(e) => {
        if (e.button !== 1 && !e.shiftKey) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
      }}
      onPointerMove={(e) => {
        if (!useStore.getState().isDragging) return
        setViewport(panBy(useStore.getState().viewport, e.movementX, e.movementY))
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId)
        setDragging(false)
      }}
    />
  )
}
```

- [ ] **Step 6: Wire it into App**

In `src/ui/App.tsx`, add `import CanvasView from './CanvasView'` and replace the canvas pane:

```tsx
        <main data-testid="canvas-pane" className="min-w-0 flex-1">
          <CanvasView />
        </main>
```

- [ ] **Step 7: Run and watch them pass**

Run: `npm test`
Expected: PASS.

Then run: `npm run dev` and confirm in a browser that a 12-copy purple hexagon ring renders, that the scroll wheel zooms toward the cursor, and that shift-drag pans.

- [ ] **Step 8: Commit**

```bash
git add src/ui
git commit -m "feat: canvas view with pan, zoom and fit"
```

---

### Task 17: PNG export

**Files:**
- Create: `src/render/exportPng.ts`
- Modify: `src/ui/TopBar.tsx`, `src/ui/TopBar.test.tsx`
- Test: `src/render/exportPng.test.ts`

**Interfaces:**
- Consumes: `Document`, `evaluate`, `buildScene`, `Canvas2DRenderer`, `browserPath2D`.
- Produces:
  - `exportParams(doc, scale): { scene: Scene; viewport: Viewport }` — pure, so the maths is testable without a canvas.
  - `exportPng(doc, scale): Promise<Blob>`
  - `downloadPng(doc, scale, filename): Promise<void>`

Export ignores the view's pan and zoom entirely: it always renders the document's own canvas at `scale`×.

- [ ] **Step 1: Write the failing test**

`src/render/exportPng.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { exportParams } from './exportPng'
import { emptyDocument, defaultLayer } from '../document/defaults'

function doc() {
  const d = emptyDocument()
  d.canvas.width = 600
  d.canvas.height = 400
  d.layers.push(defaultLayer('halo'))
  return d
}

describe('exportParams', () => {
  it('scales the scene dimensions', () => {
    const { scene } = exportParams(doc(), 4)
    expect(scene.width).toBe(2400)
    expect(scene.height).toBe(1600)
  })

  it('uses zoom equal to scale and no pan, ignoring the view', () => {
    const { viewport } = exportParams(doc(), 4)
    expect(viewport).toEqual({ pan: { x: 0, y: 0 }, zoom: 4 })
  })

  it('includes the evaluated instances', () => {
    const { scene } = exportParams(doc(), 1)
    expect(scene.layers[0].instances).toHaveLength(12)
  })

  it('rejects a non-positive scale', () => {
    expect(() => exportParams(doc(), 0)).toThrow(/scale/i)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/render/exportPng.test.ts`
Expected: FAIL — cannot resolve `./exportPng`.

- [ ] **Step 3: Implement**

`src/render/exportPng.ts`:

```ts
import type { Document } from '../document/schema'
import { evaluate } from '../geometry/evaluate'
import { Canvas2DRenderer, type DrawContext } from './canvas2d'
import { browserPath2D } from './path2d'
import type { Scene, Viewport } from './renderer'
import { buildScene } from './scene'

/** Pure: the scene and viewport an export at `scale` should use. */
export function exportParams(doc: Document, scale: number): { scene: Scene; viewport: Viewport } {
  if (!(scale > 0)) throw new Error('Export scale must be greater than zero')
  const base = buildScene(doc, evaluate(doc))
  return {
    scene: { ...base, width: doc.canvas.width * scale, height: doc.canvas.height * scale },
    viewport: { pan: { x: 0, y: 0 }, zoom: scale },
  }
}

export async function exportPng(doc: Document, scale: number): Promise<Blob> {
  const { scene, viewport } = exportParams(doc, scale)
  const canvas = document.createElement('canvas')
  canvas.width = scene.width
  canvas.height = scene.height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not acquire a 2D context for export')

  const renderer = new Canvas2DRenderer(ctx as unknown as DrawContext, browserPath2D)
  renderer.resize(scene.width, scene.height, 1)
  renderer.draw(scene, viewport)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png')
  })
}

export async function downloadPng(doc: Document, scale: number, filename = 'geo-art.png'): Promise<void> {
  const blob = await exportPng(doc, scale)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 4: Add the export control to TopBar**

Add to `src/ui/TopBar.tsx` — import `downloadPng` from `'../render/exportPng'`, then insert before the closing `</header>`:

```tsx
      <button
        className="ml-auto rounded border border-neutral-700 px-2 py-0.5 hover:bg-neutral-800"
        onClick={() => void downloadPng(doc, 2)}
      >
        Export PNG 2×
      </button>
```

- [ ] **Step 5: Add its test**

Append to `src/ui/TopBar.test.tsx`:

```tsx
  it('offers a PNG export control', () => {
    render(<TopBar />)
    expect(screen.getByRole('button', { name: /Export PNG/ })).toBeDefined()
  })
```

- [ ] **Step 6: Run and watch them pass**

Run: `npm test`
Expected: PASS.

Then run `npm run dev`, click Export PNG 2×, and confirm a 2400×2400 PNG downloads and looks right.

- [ ] **Step 7: Commit**

```bash
git add src/render src/ui
git commit -m "feat: PNG export at arbitrary scale"
```

---

### Task 18: Save, load and autosave

**Files:**
- Create: `src/document/serialize.ts`, `src/ui/useAutosave.ts`
- Modify: `src/ui/TopBar.tsx`, `src/ui/TopBar.test.tsx`
- Test: `src/document/serialize.test.ts`

**Interfaces:**
- Consumes: `documentSchema`, `Document`, `emptyDocument`, `useStore`.
- Produces:
  - `CURRENT_VERSION = 1`
  - `serialize(doc): string`
  - `deserialize(json: string): Document` — throws an `Error` with a readable message on invalid input.
  - `migrate(raw: unknown): unknown` — the migration chain; identity in Phase 1, the hook for later versions.
  - `downloadDocument(doc, filename?)`, `readDocumentFile(file): Promise<Document>`
  - `useAutosave()` — restores from `localStorage` on mount, saves on change.

- [ ] **Step 1: Write the failing test**

`src/document/serialize.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { serialize, deserialize, CURRENT_VERSION } from './serialize'
import { emptyDocument, defaultLayer } from './defaults'

describe('serialize', () => {
  it('round-trips an empty document', () => {
    const doc = emptyDocument()
    expect(deserialize(serialize(doc))).toEqual(doc)
  })

  it('round-trips a document with layers and a modulated field', () => {
    const doc = emptyDocument()
    const layer = defaultLayer('halo')
    layer.repeaters[0].spin = { base: 0, to: 360, source: 'index', curve: 'easeOut', cycles: 2 }
    doc.layers.push(layer)
    expect(deserialize(serialize(doc))).toEqual(doc)
  })

  it('writes the current version', () => {
    expect(JSON.parse(serialize(emptyDocument())).version).toBe(CURRENT_VERSION)
  })

  it('rejects malformed JSON with a readable message', () => {
    expect(() => deserialize('{not json')).toThrow(/could not be read/i)
  })

  it('rejects a document that fails validation', () => {
    expect(() => deserialize(JSON.stringify({ version: 1 }))).toThrow(/not a valid/i)
  })

  it('rejects a future version', () => {
    const raw = { ...emptyDocument(), version: 99 }
    expect(() => deserialize(JSON.stringify(raw))).toThrow(/newer version/i)
  })

  it('survives a round-trip for any generated layer count', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 12 }), (n) => {
        const doc = emptyDocument()
        for (let i = 0; i < n; i++) doc.layers.push(defaultLayer(`layer ${i}`))
        return JSON.stringify(deserialize(serialize(doc))) === JSON.stringify(doc)
      }),
    )
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/document/serialize.test.ts`
Expected: FAIL — cannot resolve `./serialize`.

- [ ] **Step 3: Implement serialisation**

`src/document/serialize.ts`:

```ts
import { documentSchema, type Document } from './schema'

export const CURRENT_VERSION = 1

export function serialize(doc: Document): string {
  return JSON.stringify(doc, null, 2)
}

/** The migration chain. Identity today; each future version appends a step. */
export function migrate(raw: unknown): unknown {
  return raw
}

export function deserialize(json: string): Document {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error('That file could not be read — it is not valid JSON.')
  }

  const version = (raw as { version?: unknown })?.version
  if (typeof version === 'number' && version > CURRENT_VERSION) {
    throw new Error(`That document was saved by a newer version of geo-art (v${version}).`)
  }

  const parsed = documentSchema.safeParse(migrate(raw))
  if (!parsed.success) {
    throw new Error(`That file is not a valid geo-art document: ${parsed.error.issues[0]?.message}`)
  }
  return parsed.data as Document
}

export function downloadDocument(doc: Document, filename = 'geo-art.json'): void {
  const blob = new Blob([serialize(doc)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export async function readDocumentFile(file: File): Promise<Document> {
  return deserialize(await file.text())
}
```

- [ ] **Step 4: Implement autosave**

`src/ui/useAutosave.ts`:

```ts
import { useEffect, useRef } from 'react'
import { deserialize, serialize } from '../document/serialize'
import { useStore } from '../state/store'

const KEY = 'geo-art:autosave'

/** Restores the last document on mount, then saves on every change. */
export function useAutosave(): void {
  const doc = useStore((s) => s.doc)
  const setDoc = useStore((s) => s.setDoc)
  const restored = useRef(false)

  useEffect(() => {
    if (restored.current) return
    restored.current = true
    const saved = localStorage.getItem(KEY)
    if (!saved) return
    try {
      setDoc(deserialize(saved))
    } catch {
      localStorage.removeItem(KEY)
    }
  }, [setDoc])

  useEffect(() => {
    if (!restored.current) return
    try {
      localStorage.setItem(KEY, serialize(doc))
    } catch {
      // Storage full or unavailable — autosave is a convenience, not a guarantee.
    }
  }, [doc])
}
```

- [ ] **Step 5: Add save/load controls and call useAutosave**

In `src/ui/TopBar.tsx`, import `{ downloadDocument, readDocumentFile }` from `'../document/serialize'` and `{ useStore }` already present; add `const setDoc = useStore((s) => s.setDoc)` and insert before the export button:

```tsx
      <button
        className="ml-auto rounded border border-neutral-700 px-2 py-0.5 hover:bg-neutral-800"
        onClick={() => downloadDocument(doc)}
      >
        Save
      </button>

      <label className="cursor-pointer rounded border border-neutral-700 px-2 py-0.5 hover:bg-neutral-800">
        Load
        <input
          aria-label="Load document"
          type="file"
          accept="application/json"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            try {
              setDoc(await readDocumentFile(file))
            } catch (error) {
              alert(error instanceof Error ? error.message : 'Could not load that file.')
            }
            e.target.value = ''
          }}
        />
      </label>
```

Remove the `ml-auto` class from the Export button, since Save now carries it.

In `src/ui/App.tsx`, import `{ useAutosave }` from `'./useAutosave'` and call `useAutosave()` as the first line of the component body.

- [ ] **Step 6: Add its test**

Append to `src/ui/TopBar.test.tsx`:

```tsx
  it('offers save and load controls', () => {
    render(<TopBar />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined()
    expect(screen.getByLabelText('Load document')).toBeDefined()
  })
```

- [ ] **Step 7: Run and watch them pass**

Run: `npm test`
Expected: PASS.

Then run `npm run dev`, change a slider, reload the page, and confirm the document comes back.

- [ ] **Step 8: Commit**

```bash
git add src/document src/ui
git commit -m "feat: save, load and localStorage autosave"
```

---

### Task 19: Starter documents and instance snapshots

**Files:**
- Create: `src/document/starters.ts`, `src/geometry/snapshot.test.ts`, `src/ui/EmptyState.tsx`
- Modify: `src/ui/App.tsx`
- Test: `src/document/starters.test.ts`, `src/ui/EmptyState.test.tsx`

**Interfaces:**
- Consumes: `Document`, `documentSchema`, `evaluate`, `useStore`.
- Produces: `STARTERS: { id: string; name: string; blurb: string; build(): Document }[]`, `EmptyState` component.

Starter ids and layer ids are **hard-coded**, not generated, so the instance snapshots are stable across runs.

- [ ] **Step 1: Write the failing starter test**

`src/document/starters.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { STARTERS } from './starters'
import { documentSchema } from './schema'
import { evaluate } from '../geometry/evaluate'

describe('starters', () => {
  it('ships at least three', () => {
    expect(STARTERS.length).toBeGreaterThanOrEqual(3)
  })

  it('every starter validates against the schema', () => {
    for (const starter of STARTERS) {
      expect(documentSchema.safeParse(starter.build()).success).toBe(true)
    }
  })

  it('every starter produces instances without truncating', () => {
    for (const starter of STARTERS) {
      const result = evaluate(starter.build())
      expect(result.totalInstances).toBeGreaterThan(0)
      expect(result.truncated).toBe(false)
    }
  })

  it('builds a fresh document each call', () => {
    const a = STARTERS[0].build()
    const b = STARTERS[0].build()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })

  it('has stable layer ids so snapshots do not churn', () => {
    expect(STARTERS[0].build().layers.map((l) => l.id)).toEqual(
      STARTERS[0].build().layers.map((l) => l.id),
    )
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- src/document/starters.test.ts`
Expected: FAIL — cannot resolve `./starters`.

- [ ] **Step 3: Implement the starters**

`src/document/starters.ts`:

```ts
import type { Colour, Document, Layer } from './schema'

const PAPER: Colour = { l: 0.97, c: 0.008, h: 90, a: 1 }
const INK: Colour = { l: 0.15, c: 0.02, h: 260, a: 1 }

function layer(id: string, name: string, over: Partial<Layer>): Layer {
  return {
    id,
    name,
    visible: true,
    shape: { type: 'polygon', sides: 6, radius: 60, rotation: 0 },
    repeaters: [{ type: 'radial', count: 12, radius: 180, startAngle: 0, spin: 0 }],
    style: { fill: { l: 0.62, c: 0.18, h: 280, a: 0.35 } },
    blend: 'normal',
    opacity: 1,
    ...over,
  }
}

function doc(background: Colour, layers: Layer[]): Document {
  return {
    version: 1,
    seed: 8814,
    canvas: { width: 1200, height: 1200, background },
    layers,
    maxInstances: 100_000,
  }
}

export const STARTERS: { id: string; name: string; blurb: string; build(): Document }[] = [
  {
    id: 'rose-window',
    name: 'Rose window',
    blurb: 'Two counter-rotated rings of translucent hexagons.',
    build: () =>
      doc(PAPER, [
        layer('rose-outer', 'outer ring', {
          shape: { type: 'polygon', sides: 6, radius: 110, rotation: 0 },
          repeaters: [{ type: 'radial', count: 18, radius: 300, startAngle: 0, spin: 0 }],
          style: { fill: { l: 0.55, c: 0.16, h: 285, a: 0.28 } },
        }),
        layer('rose-inner', 'inner ring', {
          shape: { type: 'polygon', sides: 6, radius: 90, rotation: 30 },
          repeaters: [{ type: 'radial', count: 12, radius: 170, startAngle: 15, spin: 0 }],
          style: { fill: { l: 0.68, c: 0.15, h: 210, a: 0.3 } },
        }),
      ]),
  },
  {
    id: 'aperture',
    name: 'Aperture',
    blurb: 'One ring of ellipses whose spin ramps a full turn — the modulation trick.',
    build: () =>
      doc(INK, [
        layer('aperture-blades', 'blades', {
          shape: { type: 'ellipse', rx: 220, ry: 40, rotation: 0 },
          repeaters: [
            {
              type: 'radial',
              count: 24,
              radius: 120,
              startAngle: 0,
              spin: { base: 0, to: 360, source: 'index', curve: 'linear' },
            },
          ],
          style: { fill: { l: 0.75, c: 0.14, h: 60, a: 0.12 } },
        }),
      ]),
  },
  {
    id: 'moire',
    name: 'Moiré',
    blurb: 'Three offset rings of thin ellipses; the interference does the work.',
    build: () =>
      doc(PAPER, [
        layer('moire-a', 'ring a', {
          shape: { type: 'ellipse', rx: 300, ry: 300, rotation: 0 },
          repeaters: [{ type: 'radial', count: 40, radius: 60, startAngle: 0, spin: 0 }],
          style: { fill: undefined, stroke: { colour: { l: 0.4, c: 0.1, h: 20, a: 0.25 }, width: 1.5 } },
        }),
        layer('moire-b', 'ring b', {
          shape: { type: 'ellipse', rx: 300, ry: 300, rotation: 0 },
          repeaters: [{ type: 'radial', count: 40, radius: 90, startAngle: 4.5, spin: 0 }],
          style: { fill: undefined, stroke: { colour: { l: 0.4, c: 0.12, h: 250, a: 0.25 }, width: 1.5 } },
        }),
      ]),
  },
]
```

- [ ] **Step 4: Write the instance snapshot test**

`src/geometry/snapshot.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { STARTERS } from '../document/starters'

const round = (n: number) => Number(n.toFixed(3))

/**
 * Visual regression without pixels: snapshot the instance list. Deterministic,
 * readable in a diff, and it fails on the geometry rather than on the browser's
 * rasteriser.
 */
describe('starter instance snapshots', () => {
  for (const starter of STARTERS) {
    it(`is stable for "${starter.name}"`, () => {
      const result = evaluate(starter.build())
      const summary = result.layers.map((layer) => ({
        layerId: layer.layerId,
        count: layer.instances.length,
        transforms: layer.instances.map((i) => i.transform.map(round)),
        fills: layer.instances.map((i) =>
          i.style.fill
            ? [round(i.style.fill.l), round(i.style.fill.c), round(i.style.fill.h), round(i.style.fill.a)]
            : null,
        ),
      }))
      expect(summary).toMatchSnapshot()
    })
  }
})
```

- [ ] **Step 5: Implement the empty state**

`src/ui/EmptyState.tsx`:

```tsx
import { STARTERS } from '../document/starters'
import { useStore } from '../state/store'

export default function EmptyState() {
  const setDoc = useStore((s) => s.setDoc)
  const addAndSelectLayer = useStore((s) => s.addAndSelectLayer)

  return (
    <div
      data-testid="empty-state"
      className="flex h-full flex-col items-center justify-center gap-4 p-8 text-xs"
    >
      <p className="text-neutral-400">Start from one of these, or add an empty layer.</p>
      <div className="flex flex-wrap justify-center gap-3">
        {STARTERS.map((starter) => (
          <button
            key={starter.id}
            className="w-52 rounded border border-neutral-700 p-3 text-left hover:border-sky-500 hover:bg-neutral-800"
            onClick={() => setDoc(starter.build())}
          >
            <div className="font-semibold">{starter.name}</div>
            <div className="mt-1 text-neutral-500">{starter.blurb}</div>
          </button>
        ))}
      </div>
      <button
        className="rounded border border-neutral-700 px-3 py-1 hover:bg-neutral-800"
        onClick={() => addAndSelectLayer('layer 1')}
      >
        Start empty
      </button>
    </div>
  )
}
```

`src/ui/EmptyState.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import EmptyState from './EmptyState'
import { useStore } from '../state/store'
import { emptyDocument } from '../document/defaults'
import { STARTERS } from '../document/starters'

describe('EmptyState', () => {
  beforeEach(() => {
    useStore.setState({ doc: emptyDocument(), selectedLayerId: null })
  })

  it('offers every starter', () => {
    render(<EmptyState />)
    for (const starter of STARTERS) {
      expect(screen.getByRole('button', { name: new RegExp(starter.name) })).toBeDefined()
    }
  })

  it('loads a starter', () => {
    render(<EmptyState />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(STARTERS[0].name) }))
    expect(useStore.getState().doc.layers.length).toBeGreaterThan(0)
  })

  it('starts empty with one layer', () => {
    render(<EmptyState />)
    fireEvent.click(screen.getByRole('button', { name: 'Start empty' }))
    expect(useStore.getState().doc.layers).toHaveLength(1)
  })
})
```

- [ ] **Step 6: Show the empty state in App**

In `src/ui/App.tsx`, import `EmptyState` and `useStore`, then render the canvas pane conditionally:

```tsx
        <main data-testid="canvas-pane" className="min-w-0 flex-1">
          {useStore((s) => s.doc.layers.length) === 0 ? <EmptyState /> : <CanvasView />}
        </main>
```

- [ ] **Step 7: Run everything and record the snapshots**

Run: `npm test`
Expected: PASS. Three new snapshot files are written under `src/geometry/__snapshots__/`.

Run it a second time: `npm test`
Expected: PASS with no snapshot churn — proof the ids and geometry are deterministic.

- [ ] **Step 8: Manual acceptance pass**

Run `npm run dev` and confirm:
1. The empty state offers three starters.
2. Loading "Aperture" shows 24 ellipses fanning through a full turn.
3. Selecting a layer and dragging `count`, `radius`, `hue` and `alpha` updates the canvas live.
4. Adding a second layer stacks translucently over the first.
5. Export PNG 2× downloads a 2400×2400 image matching the view.
6. Reloading the page restores the document.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: starter documents, empty state and instance snapshots"
```

---

## Deviations from the spec, and why

Each of these is a deliberate Phase 1 simplification, not an oversight. They are listed so a reviewer can check them against spec sections rather than rediscovering them.

| Spec | Phase 1 does | Reason |
|---|---|---|
| §6 `Placement = { transform, index, depth, clip }` | `Placement = { transform, ctx }` | The repeater already builds the child `EvalContext` (it must, to resolve `spin` per copy). Carrying `index`/`depth` separately would duplicate that state and let the two drift. `clip` returns in Phase 3 with `kaleido`. |
| §4 geometry imports nothing from `document/` | geometry uses `import type` from `document/schema` | Type-only imports are erased at compile time, so there is no runtime dependency and purity holds. Task 2's boundary test permits type-only imports and forbids value imports. |
| §5.4 `polygon` has `cornerRadius` | omitted | Rounded corners need fillet maths that buys nothing until there is a shape library worth rounding. Adding an optional field later is a non-breaking v1 change. |
| §5.2 `source: 'depth' \| 'radius' \| 'angle'` | `resolve` throws on them | No Phase 1 repeater varies depth, and `radius`/`angle` need post-transform position, which arrives with the grid/path repeaters. Throwing keeps the gap loud. |
| §5.2 `jitter` | omitted from `Modulated` | Requires the keyed RNG, which is Phase 3. Adding an optional field later is non-breaking. |
| §8.1 `Scene` layers carry `blend`, `opacity`, `mask` | `SceneLayer = { instances }` | Blend and masking are Phase 3, and each needs offscreen compositing. Shipping the fields without honouring them would be worse than omitting them. |
| §8.4 stride sampling | not implemented | It is a Phase 2 item and pointless until instance counts are large enough to need it. `isDragging` already exists in the store to drive it. |
| §11 easing includes `steps` | six curves, no `steps` | `steps` needs a step-count parameter, so it belongs with the Phase 2 modulation editor that can supply one. |

## Self-review

**Spec coverage.** Every Phase 1 item in spec §13 maps to a task: document schema → 7; `evaluate()` → 8; polygon + ellipse → 4; `radial` → 6; OKLCH style with alpha → 7, 9; Canvas2D renderer → 10; three-pane shell → 1, 13; layer list → 14; stacked-card inspector → 15; PNG export → 17; save/load → 18. The `Field`/`resolve()` requirement from §13's Phase 1 note → 5. Testing requirements from §11 — property tests → 2, 4, 6, 18; `FakeRenderer` → 10; Path2D reuse assertion → 10; instance-list snapshots → 19. The keyed-RNG stability test and the performance benchmark are Phase 3 and Phase 2 respectively, since neither has a subject in Phase 1.

**Fixed during review.** Three problems found and corrected: Task 2's boundary regex forbade the type-only `document/schema` import that Task 8 requires; Task 11's duplicate-layer test asserted against ids from two different documents; and `FieldRow` gave a polygon's `radius` and a radial repeater's `radius` the same `aria-label` and DOM id, which would have made Task 15's `getByLabelText` calls throw on multiple matches. `FieldRow` now takes a `scope` (`shape`, `repeat N`, `fill`) — necessary anyway, since Phase 2's chains will put two `count` fields on screen at once.

**Type consistency.** `Placement` is `{ transform, ctx }` in Tasks 6, 8 and the deviations table. `EvalContext` carries `total` in Tasks 5, 6 and 8. `Field` setters (`setShapeField`, `setRepeaterField`, `setFillChannel`) are defined in Task 15 and used only there and later. `DrawContext` and `Path2DLike` are defined in Task 10 and used in Tasks 10 and 17. `Viewport` is defined in Task 10 and consumed in Tasks 12, 16, 17.

**Known ordering constraint.** Task 8 (`evaluate`) imports types from Task 7 (`document/schema`), so Task 7 must land first. Task 13 depends on Tasks 8 and 10. Task 19 depends on everything. Tasks must be executed in order.
