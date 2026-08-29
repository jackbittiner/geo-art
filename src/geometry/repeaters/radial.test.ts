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

/** No cap: existing behavioural tests aren't about the explosion guard. */
const NO_LIMIT = Number.POSITIVE_INFINITY

describe('radial repeater', () => {
  it('produces one placement per copy', () => {
    expect(radial.expand(config({ count: 12 }), rootContext(), NO_LIMIT)).toHaveLength(12)
  })

  it('places the first copy at startAngle', () => {
    const [first] = radial.expand(
      config({ count: 4, radius: 10, startAngle: 0 }),
      rootContext(),
      NO_LIMIT,
    )
    const p = applyPoint(first.transform, { x: 0, y: 0 })
    expect(p.x).toBeCloseTo(10, 9)
    expect(p.y).toBeCloseTo(0, 9)
  })

  it('gives each child an index, count and normalised t', () => {
    const out = radial.expand(config({ count: 5 }), rootContext(), NO_LIMIT)
    expect(out.map((p) => p.ctx.indices[0])).toEqual([0, 1, 2, 3, 4])
    expect(out[0].ctx.counts).toEqual([5])
    expect(out[2].ctx.t).toBeCloseTo(0.5)
  })

  it('resolves spin against the child context so it can ramp per copy', () => {
    const out = radial.expand(
      config({ count: 4, radius: 0, spin: { base: 0, to: 90, source: 'index', curve: 'linear' } }),
      rootContext(),
      NO_LIMIT,
    )
    // Copy 3 of 4 spins a full 90 degrees: (1,0) maps to (0,1).
    const p = applyPoint(out[3].transform, { x: 1, y: 0 })
    expect(p.x).toBeCloseTo(0, 9)
    expect(p.y).toBeCloseTo(1, 9)
  })

  it('clamps to at least one copy', () => {
    expect(radial.expand(config({ count: 0 }), rootContext(), NO_LIMIT)).toHaveLength(1)
  })

  it('caps emitted copies at the given limit but keeps the full ring in context', () => {
    const out = radial.expand(config({ count: 8, radius: 10, startAngle: 0 }), rootContext(), 3)
    expect(out).toHaveLength(3)
    // Every child still knows the ring has 8 copies, not 3 — truncation must
    // clip the ring, not shrink and redistribute it.
    expect(out.every((p) => p.ctx.counts[0] === 8)).toBe(true)
    // Copy index 1 of 8 sits at 360/8 = 45 degrees, the full ring's spacing —
    // not at 360/3 = 120 degrees, which is what a redistributed 3-copy ring
    // would produce.
    const p1 = applyPoint(out[1].transform, { x: 0, y: 0 })
    expect(p1.x).toBeCloseTo(10 * Math.cos(Math.PI / 4), 9)
    expect(p1.y).toBeCloseTo(10 * Math.sin(Math.PI / 4), 9)
  })

  it('emits zero placements when the limit is zero or negative', () => {
    expect(radial.expand(config({ count: 8 }), rootContext(), 0)).toHaveLength(0)
    expect(radial.expand(config({ count: 8 }), rootContext(), -5)).toHaveLength(0)
  })

  it('places every copy at exactly the given radius', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 900000 }).map((n) => n / 1000),
        fc.integer({ min: -360000, max: 360000 }).map((n) => n / 1000),
        (count, radius, startAngle) =>
          radial
            .expand(config({ count, radius, startAngle }), rootContext(), NO_LIMIT)
            .every((pl) => {
              const p = applyPoint(pl.transform, { x: 0, y: 0 })
              return Math.abs(Math.hypot(p.x, p.y) - radius) < 1e-6
            }),
      ),
    )
  })

  it('spins each copy about its own origin, not about the canvas origin', () => {
    const [only] = radial.expand(
      config({ count: 1, radius: 10, startAngle: 0, spin: 90 }),
      rootContext(),
      NO_LIMIT,
    )
    // The copy sits at (10, 0) and is rotated 90 degrees in place, so its local
    // (1, 0) lands at (10, 1). Under a transposed compose the copy's own origin
    // would swing to (0, 10) instead.
    const origin = applyPoint(only.transform, { x: 0, y: 0 })
    expect(origin.x).toBeCloseTo(10, 9)
    expect(origin.y).toBeCloseTo(0, 9)
    const local = applyPoint(only.transform, { x: 1, y: 0 })
    expect(local.x).toBeCloseTo(10, 9)
    expect(local.y).toBeCloseTo(1, 9)
  })

  it('steps every copy around the ring, not just the first', () => {
    const placements = radial.expand(
      config({ count: 4, radius: 10, startAngle: 90, spin: 0 }),
      rootContext(),
      NO_LIMIT,
    )
    const origins = placements.map((p) => applyPoint(p.transform, { x: 0, y: 0 }))
    const expected = [
      { x: 0, y: 10 },
      { x: -10, y: 0 },
      { x: 0, y: -10 },
      { x: 10, y: 0 },
    ]
    origins.forEach((o, i) => {
      expect(o.x).toBeCloseTo(expected[i].x, 9)
      expect(o.y).toBeCloseTo(expected[i].y, 9)
    })
  })

  it('is reachable through the registry', () => {
    expect(getRepeater('radial')).toBe(radial)
  })
})
