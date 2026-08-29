import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { polygon, ellipse } from './shapes'
import { bbox, type Segment } from './path'

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

  it('ignores rotation for a circle, which is rotationally symmetric', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 360, noNaN: true }), (deg) => {
        const b = bbox(ellipse(15, 15, deg))
        return Math.abs(b.w - 30) < 1e-6 && Math.abs(b.h - 30) < 1e-6
      }),
    )
  })

  it('rotates an ellipse rigidly: on-curve points keep their radii at any angle', () => {
    fc.assert(
      fc.property(fc.double({ min: -360, max: 360, noNaN: true }), (deg) => {
        const onCurve = ellipse(20, 10, deg).segments.flatMap((s) => (s.c === 'C' ? [s.p] : []))
        const radii = onCurve.map((p) => Math.hypot(p.x, p.y)).sort((a, b) => a - b)
        const expected = [10, 10, 20, 20]
        return radii.length === 4 && radii.every((r, i) => Math.abs(r - expected[i]) < 1e-9)
      }),
    )
  })

  it('builds axis-aligned tangent handles at each quarter point', () => {
    const cubics = ellipse(20, 10, 0).segments.filter(
      (s): s is Extract<Segment, { c: 'C' }> => s.c === 'C',
    )
    expect(cubics).toHaveLength(4)

    const startOf = (i: number) => (i === 0 ? { x: 0, y: -10 } : cubics[i - 1].p)

    cubics.forEach((seg, i) => {
      const s = startOf(i)
      const leaving = { x: seg.c1.x - s.x, y: seg.c1.y - s.y }
      const arriving = { x: seg.p.x - seg.c2.x, y: seg.p.y - seg.c2.y }
      // At a pole the handle is horizontal; at a side it is vertical.
      const leavingPole = Math.abs(s.x) < 1e-9
      expect(Math.abs(leavingPole ? leaving.y : leaving.x)).toBeLessThan(1e-9)
      const arrivingPole = Math.abs(seg.p.x) < 1e-9
      expect(Math.abs(arrivingPole ? arriving.y : arriving.x)).toBeLessThan(1e-9)
    })
  })
})
