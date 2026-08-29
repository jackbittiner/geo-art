import { describe, it, expect } from 'vitest'
import { resolve, isModulated, type Modulated } from './field'
import { rootContext, type EvalContext } from './context'

const ctx = (over: Partial<EvalContext> = {}): EvalContext => ({ ...rootContext(), ...over })

describe('resolve', () => {
  it('returns a plain number unchanged', () => {
    expect(resolve(42, ctx())).toBe(42)
  })

  it('isModulated discriminates', () => {
    expect(isModulated(42)).toBe(false)
    expect(isModulated({ base: 0, to: 1, source: 't', curve: 'linear' })).toBe(true)
  })

  it('ramps linearly across the innermost repeater index', () => {
    const field: Modulated = { base: 0, to: 100, source: 'index', curve: 'linear' }
    expect(resolve(field, ctx({ indices: [0], counts: [5] }))).toBeCloseTo(0)
    expect(resolve(field, ctx({ indices: [2], counts: [5] }))).toBeCloseTo(50)
    expect(resolve(field, ctx({ indices: [4], counts: [5] }))).toBeCloseTo(100)
  })

  it('returns base when a repeater has a single copy', () => {
    const field: Modulated = { base: 7, to: 99, source: 'index', curve: 'linear' }
    expect(resolve(field, ctx({ indices: [0], counts: [1] }))).toBe(7)
  })

  it('targets an outer chain level when level is given', () => {
    const field: Modulated = { base: 0, to: 10, source: 'index', level: 0, curve: 'linear' }
    expect(resolve(field, ctx({ indices: [1, 9], counts: [3, 10] }))).toBeCloseTo(5)
  })

  it('applies the easing curve', () => {
    const field: Modulated = { base: 0, to: 100, source: 't', curve: 'easeIn' }
    expect(resolve(field, ctx({ t: 0.5 }))).toBeCloseTo(25)
  })

  it('repeats the ramp when cycles > 1', () => {
    const field: Modulated = { base: 0, to: 100, source: 't', curve: 'linear', cycles: 2 }
    expect(resolve(field, ctx({ t: 0.25 }))).toBeCloseTo(50)
    expect(resolve(field, ctx({ t: 0.5 }))).toBeCloseTo(0)
    expect(resolve(field, ctx({ t: 1 }))).toBeCloseTo(100)
  })

  it('normalises flatIndex across the whole layer', () => {
    const field: Modulated = { base: 0, to: 1, source: 'flatIndex', curve: 'linear' }
    expect(resolve(field, ctx({ flatIndex: 3, total: 7 }))).toBeCloseTo(0.5)
  })

  it('throws on a source that Phase 1 does not implement', () => {
    const field = { base: 0, to: 1, source: 'radius', curve: 'linear' } as unknown as Modulated
    expect(() => resolve(field, ctx())).toThrow(/not supported/i)
  })
})
