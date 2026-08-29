import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { polygon, ellipse } from './shapes'
import { bbox, type Segment } from './path'

/**
 * fast-check's fc.double samples the *bit* space of float64, not the interval:
 * with { min, max } the overwhelming majority of samples land in the first
 * decile and only a handful anywhere in the interior. Rotation properties fed
 * that way are near-worthless -- they end up asserting rigidity at ~1e-300
 * angles, where every rotation is the identity, which is exactly how two
 * rotation mutations survived the whole suite. Sampling an integer and scaling
 * it gives a uniform spread at a fixed resolution (0.001 here), per project
 * convention.
 */
const arbScaled = (min: number, max: number, resolution = 1000) =>
  fc.integer({ min: min * resolution, max: max * resolution }).map((n) => n / resolution)

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

  // A property test over radii and vertex counts cannot see the units of the
  // rotation argument: |v| = radius holds whether 90 means 90 degrees or 90
  // radians. These are the exact coordinates for one known input, which is
  // what pins degToRad being applied at all.
  it('rotates by degrees, not radians: polygon(4, 10, 90) is the axis-aligned diamond', () => {
    const points = polygon(4, 10, 90).segments.flatMap((s) =>
      s.c === 'M' || s.c === 'L' ? [s.p] : [],
    )
    // phase = 90deg - 90deg = 0, so the first vertex sits on +x and the rest
    // follow every quarter turn. Treating 90 as radians lands nowhere near.
    const expected = [
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      { x: -10, y: 0 },
      { x: 0, y: -10 },
    ]
    expect(points).toHaveLength(4)
    points.forEach((p, i) => {
      expect(p.x).toBeCloseTo(expected[i].x, 9)
      expect(p.y).toBeCloseTo(expected[i].y, 9)
    })
  })

  it('clamps to a minimum of 3 sides', () => {
    expect(polygon(1, 10, 0).segments.filter((s) => s.c !== 'Z')).toHaveLength(3)
  })

  it('places every vertex at the given radius', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 60 }),
        arbScaled(1, 500),
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
      fc.property(arbScaled(0, 360), (deg) => {
        const b = bbox(ellipse(15, 15, deg))
        return Math.abs(b.w - 30) < 1e-6 && Math.abs(b.h - 30) < 1e-6
      }),
    )
  })

  it('rotates an ellipse rigidly: on-curve points keep their radii at any angle', () => {
    fc.assert(
      fc.property(arbScaled(-360, 360), (deg) => {
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

  it('places each segment midpoint exactly on the ellipse, which pins KAPPA', () => {
    const rx = 20
    const ry = 10
    const cubics = ellipse(rx, ry, 0).segments.filter(
      (s): s is Extract<Segment, { c: 'C' }> => s.c === 'C',
    )
    const startOf = (i: number) => (i === 0 ? { x: 0, y: -ry } : cubics[i - 1].p)

    cubics.forEach((seg, i) => {
      const p0 = startOf(i)
      // A cubic Bezier at t = 0.5 is (P0 + 3*P1 + 3*P2 + P3) / 8.
      const mx = (p0.x + 3 * seg.c1.x + 3 * seg.c2.x + seg.p.x) / 8
      const my = (p0.y + 3 * seg.c1.y + 3 * seg.c2.y + seg.p.y) / 8
      expect((mx / rx) ** 2 + (my / ry) ** 2).toBeCloseTo(1, 12)
    })
  })
  // The rigidity property above holds for any rotation *convention*: a sign
  // flip and a degrees/radians mix-up both preserve every point's radius. Only
  // exact coordinates for a known angle pin the convention itself. At +90deg
  // (counter-clockwise in this y-down space) the rotation maps (x, y) to
  // (-y, x), so the north pole (0, -ry) lands on +x.
  it('rotates by +90 degrees exactly: (x, y) becomes (-y, x)', () => {
    const KAPPA = 0.5522847498307936
    const ox = 20 * KAPPA
    const oy = 10 * KAPPA
    // The unrotated ellipse, mapped by hand through (x, y) -> (-y, x).
    const expected: Segment[] = [
      { c: 'M', p: { x: 10, y: 0 } },
      { c: 'C', c1: { x: 10, y: ox }, c2: { x: oy, y: 20 }, p: { x: 0, y: 20 } },
      { c: 'C', c1: { x: -oy, y: 20 }, c2: { x: -10, y: ox }, p: { x: -10, y: 0 } },
      { c: 'C', c1: { x: -10, y: -ox }, c2: { x: -oy, y: -20 }, p: { x: 0, y: -20 } },
      { c: 'C', c1: { x: oy, y: -20 }, c2: { x: 10, y: -ox }, p: { x: 10, y: 0 } },
      { c: 'Z' },
    ]

    const actual = ellipse(20, 10, 90).segments
    expect(actual.map((s) => s.c)).toEqual(expected.map((s) => s.c))

    const points = (segments: Segment[]) =>
      segments.flatMap((s) => {
        if (s.c === 'Z') return []
        return s.c === 'C' ? [s.c1, s.c2, s.p] : [s.p]
      })

    const got = points(actual)
    const want = points(expected)
    expect(got).toHaveLength(want.length)
    got.forEach((p, i) => {
      expect(p.x).toBeCloseTo(want[i].x, 9)
      expect(p.y).toBeCloseTo(want[i].y, 9)
    })
  })
})
