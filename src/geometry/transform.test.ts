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

  const arbComponent = fc.double({ min: -100, max: 100, noNaN: true })

  /**
   * Well-conditioned matrices only. A near-singular matrix amplifies float64
   * error under inversion or triple composition past any fixed tolerance,
   * which would test the IEEE spec rather than this module's algebra.
   */
  const arbMat = fc
    .tuple(arbComponent, arbComponent, arbComponent, arbComponent)
    .filter(([a, b, c, d]) => Math.abs(a * d - b * c) > 1)
    .chain(([a, b, c, d]) =>
      fc.tuple(arbComponent, arbComponent).map(([e, f]) => [a, b, c, d, e, f] as const),
    )

  /** Relative comparison: absolute epsilons are meaningless across these magnitudes. */
  const closeRelative = (a: number, b: number, eps: number) =>
    Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b))

  it('invert round-trips any invertible matrix', () => {
    fc.assert(
      fc.property(arbMat, arbComponent, arbComponent, (m, x, y) => {
        const there = applyPoint(m, { x, y })
        const back = applyPoint(invert(m), there)
        return closeRelative(back.x, x, 1e-7) && closeRelative(back.y, y, 1e-7)
      }),
    )
  })

  it('compose is associative', () => {
    fc.assert(
      fc.property(arbMat, arbMat, arbMat, arbComponent, arbComponent, (a, b, c, x, y) => {
        const left = applyPoint(compose(compose(a, b), c), { x, y })
        const right = applyPoint(compose(a, compose(b, c)), { x, y })
        return closeRelative(left.x, right.x, 1e-6) && closeRelative(left.y, right.y, 1e-6)
      }),
    )
  })
})
