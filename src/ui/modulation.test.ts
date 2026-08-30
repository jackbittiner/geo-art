import { describe, it, expect } from 'vitest'
import { toModulated } from './modulation'
import { COLOUR_FIELDS, SHAPE_FIELDS, REPEATER_FIELDS, type FieldDescriptor } from './descriptors'

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
})
