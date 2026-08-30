import { describe, it, expect } from 'vitest'
import { toModulated, previewValues, PREVIEW_CELLS } from './modulation'
import { COLOUR_FIELDS, SHAPE_FIELDS, REPEATER_FIELDS, type FieldDescriptor } from './descriptors'
import { evaluate } from '../geometry/evaluate'
import { emptyDocument, defaultLayer } from '../document/defaults'
import type { Modulated } from '../geometry/field'
// defaultLayer always seeds a radial repeater, so this narrowing is honest
// rather than a cast papering over doubt about the union.
import type { RadialConfig } from '../geometry/repeaters'

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

  // Task 2 left this tie-break unpinned: `far`'s branch is a strict `>`, so a
  // base sitting exactly at the midpoint of [min, max] resolves to `max`.
  // That choice is arbitrary, but it must stay fixed — flipping the strict
  // comparison, or swapping the ternary's branches, would invert the
  // midpoint's behaviour with no test failing.
  it('pins the far tie-break at the exact midpoint to max (arbitrary but fixed)', () => {
    expect(toModulated(colour('l'), 0.5).to).toBe(1)
  })
})

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

  // PREVIEW_CELLS is the exact point where `cells === total` flips to
  // `cells < total`, and nothing sat on it: 5 copies and 500 copies are both
  // a long way from the boundary.
  it('gives one cell per copy at exactly PREVIEW_CELLS, and subsamples one above', () => {
    expect(previewValues(ramp(), PREVIEW_CELLS - 1)).toHaveLength(PREVIEW_CELLS - 1)
    expect(previewValues(ramp(), PREVIEW_CELLS)).toHaveLength(PREVIEW_CELLS)
    expect(previewValues(ramp(), PREVIEW_CELLS + 1)).toHaveLength(PREVIEW_CELLS)

    // At exactly PREVIEW_CELLS every cell is its own copy: no index repeated,
    // none skipped, so the series steps by a single uniform amount.
    const stepsOf = (values: number[]) =>
      new Set(values.slice(1).map((v, i) => Number((v - values[i]).toFixed(9))))
    const at = previewValues(ramp(), PREVIEW_CELLS)
    expect(stepsOf(at).size).toBe(1)

    // One copy above, 24 cells have to cover 25 copies, so exactly one copy is
    // skipped and a second, double-width step appears.
    const above = previewValues(ramp(), PREVIEW_CELLS + 1)
    expect(stepsOf(above).size).toBe(2)

    // Both still span the whole ramp, ends included.
    for (const values of [at, above]) {
      expect(values[0]).toBeCloseTo(0, 9)
      expect(values.at(-1)).toBeCloseTo(100, 9)
    }
  })

  // `Math.round` and `Math.max(0, ...)` were both unpinned: swapping round for
  // floor or ceil, or dropping the clamp, left the whole suite green.
  it('rounds a fractional copy count and yields nothing for a negative one', () => {
    expect(previewValues(ramp(), 5.6)).toHaveLength(6) // round, not floor
    expect(previewValues(ramp(), 5.2)).toHaveLength(5) // round, not ceil
    expect(previewValues(ramp(), -3)).toEqual([])
  })

  it('agrees with what evaluate() actually produces', () => {
    // The anti-drift property: the preview must be the engine's own answer,
    // not a second implementation of the ramp maths that can diverge.
    const hue: Modulated = { base: 0, to: 240, source: 'index', curve: 'easeOut' }
    const doc = emptyDocument()
    const layer = defaultLayer('halo')
    ;(layer.repeaters[0] as RadialConfig).count = 12
    layer.style.fill = { l: 0.6, c: 0.2, h: hue, a: 1 }
    doc.layers.push(layer)

    const actual = evaluate(doc).layers[0].instances.map((i) => i.style.fill!.h)
    expect(previewValues(hue, 12)).toEqual(actual)
  })

  // The test above uses 12 copies, which is below PREVIEW_CELLS, so no
  // subsampling ever happens (cells === total, every index is its own true
  // index) — it cannot tell "true index against true total" apart from
  // "renumbered 0..23". This one drives 200 real copies through evaluate()
  // and checks the full sampled array against the same 24 true indices
  // `previewValues` is supposed to pick, so a renumbering bug fails it.
  it('samples the true index against the true total even when heavily subsampled', () => {
    const hue: Modulated = { base: 0, to: 240, source: 'index', curve: 'easeOut' }
    const doc = emptyDocument()
    const layer = defaultLayer('halo')
    const total = 200
    ;(layer.repeaters[0] as RadialConfig).count = total
    layer.style.fill = { l: 0.6, c: 0.2, h: hue, a: 1 }
    doc.layers.push(layer)

    const actual = evaluate(doc).layers[0].instances.map((i) => i.style.fill!.h)
    const expected = Array.from(
      { length: PREVIEW_CELLS },
      (_, k) => actual[Math.round((k * (total - 1)) / (PREVIEW_CELLS - 1))],
    )
    expect(previewValues(hue, total)).toEqual(expected)
  })
  // `previewContext` populates `t` and `flatIndex` alongside `indices`, but
  // piece A's toggle only ever writes `source: 'index'`, so nothing exercised
  // them: zeroing either one left the suite green. They are correct today --
  // pin them now, against the engine's own answer, while that is known.
  it('resolves a `t`-sourced ramp the way evaluate() does', () => {
    const hue: Modulated = { base: 0, to: 240, source: 't', curve: 'easeOut' }
    const doc = emptyDocument()
    const layer = defaultLayer('halo')
    ;(layer.repeaters[0] as RadialConfig).count = 9
    layer.style.fill = { l: 0.6, c: 0.2, h: hue, a: 1 }
    doc.layers.push(layer)

    const actual = evaluate(doc).layers[0].instances.map((i) => i.style.fill!.h)
    expect(previewValues(hue, 9)).toEqual(actual)
    // And it is not the degenerate all-base answer a zeroed `t` would give.
    expect(new Set(actual).size).toBe(9)
  })

  it('resolves a `flatIndex`-sourced ramp the way evaluate() does', () => {
    const hue: Modulated = { base: 0, to: 240, source: 'flatIndex', curve: 'easeOut' }
    const doc = emptyDocument()
    const layer = defaultLayer('halo')
    ;(layer.repeaters[0] as RadialConfig).count = 9
    layer.style.fill = { l: 0.6, c: 0.2, h: hue, a: 1 }
    doc.layers.push(layer)

    const actual = evaluate(doc).layers[0].instances.map((i) => i.style.fill!.h)
    expect(previewValues(hue, 9)).toEqual(actual)
    expect(new Set(actual).size).toBe(9)
  })

  // KNOWN LIMITATION, pinned deliberately rather than fixed here.
  //
  // `previewValues` is handed `perLayerCounts`, the count the engine actually
  // *emitted*. `resolve` normalises against `ctx.counts`, the count the
  // repeater *intended* -- radial records the full count on every child even
  // when the instance budget cut it short. Under truncation the two diverge
  // and the preview promises a sweep the canvas never draws.
  //
  // The real fix is an `intendedCounts` alongside `perLayerCounts` on
  // EvaluationResult, which the Inspector would pass here instead. That is an
  // engine change and belongs to a later piece; this branch surfaces the
  // caveat in the editor instead (see ModulatorEditor's truncation note).
  //
  // This test exists to make that divergence loud the day someone tries to
  // close it: if the preview starts agreeing with the engine under
  // truncation, this test fails and should simply be deleted.
  it('overstates the ramp under truncation (known limitation, see intendedCounts)', () => {
    const hue: Modulated = { base: 0, to: 240, source: 'index', curve: 'linear' }
    const doc = emptyDocument()
    doc.maxInstances = 6
    const layer = defaultLayer('halo')
    ;(layer.repeaters[0] as RadialConfig).count = 12
    layer.style.fill = { l: 0.6, c: 0.2, h: hue, a: 1 }
    doc.layers.push(layer)

    const result = evaluate(doc)
    expect(result.truncated).toBe(true)

    // The engine emits 6 copies but still spreads them over the intended 12,
    // so the ring only reaches 240 * 5/11.
    const emitted = result.layers[0].instances.map((i) => i.style.fill!.h)
    expect(emitted).toHaveLength(6)
    expect(emitted.map((v) => Number(v.toFixed(1))))
      .toEqual([0, 21.8, 43.6, 65.5, 87.3, 109.1])

    // The preview, handed the emitted count of 6, spreads the whole ramp
    // across those 6 and promises the full 240.
    expect(previewValues(hue, result.perLayerCounts[layer.id]))
      .toEqual([0, 48, 96, 144, 192, 240])
  })
})
