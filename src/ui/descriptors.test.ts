import { describe, it, expect } from 'vitest'
import { SHAPE_FIELDS, REPEATER_FIELDS, COLOUR_FIELDS, type FieldDescriptor } from './descriptors'

const geometryFields: FieldDescriptor[] = [
  ...Object.values(SHAPE_FIELDS).flat(),
  ...Object.values(REPEATER_FIELDS).flat(),
]

const all: FieldDescriptor[] = [...geometryFields, ...COLOUR_FIELDS]

describe('descriptor modulation metadata', () => {
  it('marks every shape field as varying per copy', () => {
    for (const d of Object.values(SHAPE_FIELDS).flat()) {
      expect(d.perCopy, `${d.key} should be perCopy`).toBe(true)
    }
  })

  it('marks every colour channel as varying per copy, previewed as a gradient', () => {
    for (const d of COLOUR_FIELDS) {
      expect(d.perCopy, `${d.key} should be perCopy`).toBe(true)
      expect(d.preview, `${d.key} should preview as a gradient`).toBe('gradient')
    }
  })

  it('marks only spin as varying per copy on the radial repeater', () => {
    // count, radius and startAngle resolve against the parent context, so with
    // a single repeater they return `base` unchanged — see spec §4a.
    const perCopy = REPEATER_FIELDS.radial.filter((d) => d.perCopy).map((d) => d.key)
    expect(perCopy).toEqual(['spin'])
  })

  it('gives hue a wrapping +120 degree ramp', () => {
    const hue = COLOUR_FIELDS.find((d) => d.key === 'h')!
    expect(hue.wraps).toBe(true)
    expect(hue.rampTo).toEqual({ kind: 'offset', delta: 120 })
  })

  it('ramps alpha and chroma to zero, and lightness to whichever bound is further', () => {
    expect(COLOUR_FIELDS.find((d) => d.key === 'a')!.rampTo).toEqual({ kind: 'value', value: 0 })
    expect(COLOUR_FIELDS.find((d) => d.key === 'c')!.rampTo).toEqual({ kind: 'value', value: 0 })
    expect(COLOUR_FIELDS.find((d) => d.key === 'l')!.rampTo).toEqual({ kind: 'far' })
  })

  it('gives every rotation-like field a full turn', () => {
    // Restricted to geometry fields: hue also has unit '°' and perCopy, but
    // it ramps a +120 degree colour-wheel jump, not a spatial turn (see the
    // 'gives hue a wrapping +120 degree ramp' test above) — including
    // COLOUR_FIELDS here would wrongly assert 360 on hue's rampTo.
    const turns = geometryFields.filter((d) => d.unit === '°' && d.perCopy)
    expect(turns.length).toBeGreaterThan(0)
    for (const d of turns) {
      expect(d.rampTo, `${d.key} should ramp a full turn`).toEqual({ kind: 'offset', delta: 360 })
    }
  })

  // A rotation of 405 degrees is a rotation of 45 degrees, so a full-turn ramp
  // needs a `to` past the descriptor's own 360 -- exactly what `wraps` buys
  // hue. Without it, toModulated(spin, 45) writes a `to` of 405 that spin's
  // own -360..360 slider cannot represent.
  it('marks every rotation-like field as wrapping', () => {
    const turns = geometryFields.filter((d) => d.unit === '°' && d.perCopy)
    expect(turns.length).toBeGreaterThan(0)
    for (const d of turns) {
      expect(d.wraps, `${d.key} is an angle, so it wraps`).toBe(true)
    }
  })

  it('never declares rampTo on a field that cannot vary', () => {
    for (const d of all.filter((x) => !x.perCopy)) {
      expect(d.rampTo, `${d.key} cannot vary, so a ramp target is misleading`).toBeUndefined()
    }
  })
})
