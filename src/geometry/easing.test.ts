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
