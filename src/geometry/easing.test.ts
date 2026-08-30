import { describe, it, expect } from 'vitest'
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

  it('is monotonic non-decreasing across a dense sweep', () => {
    const STEPS = 1000
    const violations: string[] = []
    for (const kind of EASINGS) {
      let previous = ease(kind, 0)
      for (let i = 1; i <= STEPS; i++) {
        const t = i / STEPS
        const value = ease(kind, t)
        if (value < previous - 1e-12) {
          violations.push(`${kind} decreased at t=${t}: ${previous} -> ${value}`)
        }
        previous = value
      }
    }
    expect(violations).toEqual([])
  })
})
