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
        fc.integer({ min: 0, max: 900000 }).map((n) => n / 1000),
        fc.integer({ min: -360000, max: 360000 }).map((n) => n / 1000),
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
