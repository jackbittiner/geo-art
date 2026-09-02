import { describe, it, expect } from 'vitest'
import type { Colour } from '../document/schema'
import type { Modulated } from '../geometry/field'
import { endpointColour, isRamped, setRamped, writeEndpoint } from './colourRamp'

const FLAT: Colour = { l: 0.6, c: 0.2, h: 280, a: 1 }
const hueRamp: Modulated = { base: 280, to: 40, source: 'index', curve: 'easeOut', cycles: 2 }
const RAMPED: Colour = { ...FLAT, h: hueRamp }

describe('endpointColour', () => {
  it('reads "from" as every channel base', () => {
    expect(endpointColour(RAMPED, 'from')).toEqual({ l: 0.6, c: 0.2, h: 280, a: 1 })
  })

  it('reads "to" as the ramp target where there is one, and the base where there is not', () => {
    expect(endpointColour(RAMPED, 'to')).toEqual({ l: 0.6, c: 0.2, h: 40, a: 1 })
  })

  // The chips must describe a document nobody made with them -- a hand-tuned
  // per-channel ramp is still exactly a first and a last copy.
  it('reads both endpoints of a flat colour as the same colour', () => {
    expect(endpointColour(FLAT, 'to')).toEqual(endpointColour(FLAT, 'from'))
  })
})

describe('writeEndpoint', () => {
  it('sets the base of every channel when writing "from"', () => {
    const next = writeEndpoint(FLAT, 'from', { l: 0.3, c: 0.1, h: 90, a: 0.5 })
    expect(next).toEqual({ l: 0.3, c: 0.1, h: 90, a: 0.5 })
  })

  it('keeps a channel modulated when writing "from", changing only its base', () => {
    const next = writeEndpoint(RAMPED, 'from', { l: 0.6, c: 0.2, h: 200, a: 1 })
    expect(next.h).toEqual({ ...hueRamp, base: 200 })
  })

  // The whole point of keeping the per-channel fold: the chips move endpoints
  // and must never quietly discard a curve, a source or a cycle count.
  it('preserves curve, source and cycles when writing "to"', () => {
    const next = writeEndpoint(RAMPED, 'to', { l: 0.6, c: 0.2, h: 200, a: 1 })
    expect(next.h).toEqual({ ...hueRamp, to: 200 })
  })

  it('promotes a flat channel to a ramp when "to" differs from its base', () => {
    const next = writeEndpoint(FLAT, 'to', { l: 0.9, c: 0.2, h: 280, a: 1 })
    expect(next.l).toEqual({ base: 0.6, to: 0.9, source: 'index', curve: 'linear' })
  })

  it('leaves a flat channel flat when "to" matches its base', () => {
    const next = writeEndpoint(FLAT, 'to', { l: 0.9, c: 0.2, h: 280, a: 1 })
    expect(next.c).toBe(0.2)
    expect(next.h).toBe(280)
    expect(next.a).toBe(1)
  })

  // Hue wraps, so 280 -> 40 could sweep 240 degrees backwards through green or
  // 120 degrees forwards through red. Dragging the chip to a nearby hue should
  // take the short way round; the strip would otherwise show a sweep through
  // colours the user never went near.
  it('takes the shorter arc when writing a hue target', () => {
    const next = writeEndpoint(FLAT, 'to', { l: 0.6, c: 0.2, h: 40, a: 1 })
    expect(next.h).toEqual({ base: 280, to: 400, source: 'index', curve: 'linear' })
  })

  it('does not reach for the shorter arc when the sweep is already short', () => {
    const next = writeEndpoint(FLAT, 'to', { l: 0.6, c: 0.2, h: 200, a: 1 })
    expect(next.h).toEqual({ base: 280, to: 200, source: 'index', curve: 'linear' })
  })
})

describe('isRamped', () => {
  it('is true when any single channel carries a ramp', () => {
    expect(isRamped(RAMPED)).toBe(true)
    expect(isRamped(FLAT)).toBe(false)
  })
})

describe('setRamped', () => {
  it('collapses every channel to its base when switched off', () => {
    expect(setRamped(RAMPED, false)).toEqual(FLAT)
  })

  // Seeding all four channels at once would fade the layer towards grey and
  // invisible in one click (chroma and alpha both ramp to zero by default).
  // Hue alone is the legible gesture, and the user shapes it from there.
  it('seeds a visible hue sweep and nothing else when switched on', () => {
    const next = setRamped(FLAT, true)
    expect(next.h).toEqual({ base: 280, to: 400, source: 'index', curve: 'linear' })
    expect(next.l).toBe(0.6)
    expect(next.c).toBe(0.2)
    expect(next.a).toBe(1)
  })

  it('leaves an already ramped colour untouched when switched on', () => {
    expect(setRamped(RAMPED, true)).toEqual(RAMPED)
  })
})
