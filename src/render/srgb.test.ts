import { describe, expect, test } from 'vitest'
import { hexToOklch, oklchToHex } from './srgb'

describe('oklchToHex', () => {
  test('maps the achromatic extremes to black and white', () => {
    expect(oklchToHex({ l: 0, c: 0, h: 0 })).toBe('#000000')
    expect(oklchToHex({ l: 1, c: 0, h: 0 })).toBe('#FFFFFF')
  })

  test('maps the sRGB primaries to their exact hex codes', () => {
    expect(oklchToHex({ l: 0.62796, c: 0.25768, h: 29.234 })).toBe('#FF0000')
    expect(oklchToHex({ l: 0.86644, c: 0.29483, h: 142.495 })).toBe('#00FF00')
    expect(oklchToHex({ l: 0.45201, c: 0.31321, h: 264.052 })).toBe('#0000FF')
  })

  test('clamps a colour outside the sRGB gamut to a valid hex code', () => {
    // Chroma 0.5 at this lightness is far outside sRGB; the document keeps the
    // true OKLCH, so the only requirement on the readout is that it is legal.
    expect(oklchToHex({ l: 0.7, c: 0.5, h: 140 })).toMatch(/^#[0-9A-F]{6}$/)
  })

  test('wraps hue rather than treating it as out of range', () => {
    expect(oklchToHex({ l: 0.62796, c: 0.25768, h: 389.234 })).toBe('#FF0000')
  })
})

describe('hexToOklch', () => {
  test('maps sRGB red back to its OKLCH coordinates', () => {
    const red = hexToOklch('#FF0000')!
    expect(red.l).toBeCloseTo(0.62796, 3)
    expect(red.c).toBeCloseTo(0.25768, 3)
    expect(red.h).toBeCloseTo(29.234, 1)
  })

  test('accepts lower case and a missing leading hash', () => {
    expect(hexToOklch('00ff00')).toEqual(hexToOklch('#00FF00'))
  })

  test('returns null for anything that is not a six digit hex code', () => {
    expect(hexToOklch('#ff00')).toBeNull()
    expect(hexToOklch('nonsense')).toBeNull()
    expect(hexToOklch('')).toBeNull()
  })

  test('round trips every in-gamut colour it produces', () => {
    for (const hex of ['#3E8E9C', '#1A1A1A', '#F0C674', '#7B4FA0']) {
      expect(oklchToHex(hexToOklch(hex)!)).toBe(hex)
    }
  })
})
