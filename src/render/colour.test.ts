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
