import { describe, it, expect } from 'vitest'
import { randomLayer, type Rng } from './random'
import { layerSchema } from './schema'
import { emptyDocument } from './defaults'
import { evaluate } from '../geometry/evaluate'
import { isModulated, type Field } from '../geometry/field'
import type { Layer } from './schema'

/** Every Field on a layer, so a claim about modulation cannot miss one. */
function fields(layer: Layer): Field[] {
  const out: Field[] = []
  out.push(...Object.values(layer.shape).filter((v): v is Field => typeof v !== 'string'))
  for (const rep of layer.repeaters) {
    out.push(...Object.values(rep).filter((v): v is Field => typeof v !== 'string'))
  }
  const fill = layer.style.fill
  if (fill) out.push(fill.l, fill.c, fill.h, fill.a)
  return out
}

function draws(n: number, rng: Rng = Math.random): Layer[] {
  return Array.from({ length: n }, (_, i) => randomLayer(`layer ${i}`, rng))
}

// The largest double below 1. `Math.random` never returns 1, so this is the
// top of every range the generator can actually reach.
const ALMOST_ONE = 1 - Number.EPSILON / 2

describe('randomLayer', () => {
  // The two tests below pin the draw order and every range endpoint. They are
  // the reason a later tweak to a range cannot pass unnoticed.
  it('bottoms out every range when the rng returns 0', () => {
    const layer = randomLayer('rolled', () => 0)
    expect(layer).toMatchObject({
      name: 'rolled',
      visible: true,
      blend: 'normal',
      opacity: 1,
      shape: { type: 'polygon', sides: 3, radius: 40, rotation: 0 },
      repeaters: [
        {
          type: 'radial',
          count: 6,
          radius: 80,
          startAngle: 0,
          spin: { base: 0, to: -360, source: 'index', curve: 'linear' },
        },
      ],
      style: { fill: { l: 0.5, c: 0.1, h: 0, a: 0.2 } },
    })
  })

  it('tops out every range when the rng returns just under 1', () => {
    const layer = randomLayer('rolled', () => ALMOST_ONE)
    expect(layer.shape.type).toBe('ellipse')
    if (layer.shape.type !== 'ellipse') throw new Error('unreachable')
    expect(layer.shape.rx).toBeCloseTo(260, 6)
    expect(layer.shape.ry).toBeCloseTo(260, 6)
    expect(layer.shape.rotation).toBeCloseTo(360, 6)

    const [repeater] = layer.repeaters
    expect(repeater.type).toBe('grid')
    if (repeater.type !== 'grid') throw new Error('unreachable')
    expect(repeater.rows).toBe(6)
    expect(repeater.cols).toBe(6)
    expect(repeater.spacingX).toBeCloseTo(200, 6)
    expect(repeater.spacingY).toBeCloseTo(200, 6)
    // The top of the range is the un-modulated half of the coin flip.
    expect(repeater.spin).toBe(0)

    const fill = layer.style.fill!
    expect(fill.l).toBeCloseTo(0.8, 6)
    expect(fill.c).toBeCloseTo(0.2, 6)
    expect(fill.h).toBeCloseTo(360, 6)
    expect(fill.a).toBeCloseTo(0.5, 6)
  })

  it('produces a layer the schema accepts, on every draw', () => {
    // The schema is the real guard here: it bounds l, c and a, and narrows the
    // modulation source to the three the Phase 1 engine implements.
    for (const layer of draws(300)) {
      const parsed = layerSchema.safeParse(layer)
      expect(parsed.success, JSON.stringify(layer)).toBe(true)
    }
  })

  it('reaches both shape types and both repeater types', () => {
    const layers = draws(200)
    expect(new Set(layers.map((l) => l.shape.type))).toEqual(new Set(['polygon', 'ellipse']))
    expect(new Set(layers.map((l) => l.repeaters[0].type))).toEqual(new Set(['radial', 'grid']))
  })

  it('modulates at most one field', () => {
    for (const layer of draws(200)) {
      expect(fields(layer).filter(isModulated).length).toBeLessThanOrEqual(1)
    }
  })

  it('evaluates to a drawable, bounded set of instances on every draw', () => {
    // A roll goes straight onto the canvas, so a configuration the engine
    // chokes on — or one that blows past the instance guard — is a bug in the
    // ranges, not something the user should discover.
    for (const layer of draws(200)) {
      const result = evaluate({ ...emptyDocument(), layers: [layer] })
      expect(result.totalInstances).toBeGreaterThan(0)
      expect(result.totalInstances).toBeLessThanOrEqual(36)
    }
  })

  it('takes the given name and a fresh id each time', () => {
    const layers = draws(50)
    expect(layers[0].name).toBe('layer 0')
    expect(new Set(layers.map((l) => l.id)).size).toBe(50)
  })
})
