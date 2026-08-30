import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { applyPoint } from './transform'
import { emptyDocument, defaultLayer } from '../document/defaults'
import type { Document } from '../document/schema'
// Fixtures here are always built as radial by defaultLayer/docWith, so this
// narrowing is honest, not a cast papering over doubt about the union.
import type { RadialConfig, RepeaterConfig } from './repeaters'

function docWith(...mutate: ((d: Document) => void)[]): Document {
  const doc = emptyDocument()
  doc.layers.push(defaultLayer('halo'))
  for (const fn of mutate) fn(doc)
  return doc
}

describe('evaluate', () => {
  it('returns no instances for an empty document', () => {
    const result = evaluate(emptyDocument())
    expect(result.totalInstances).toBe(0)
    expect(result.layers).toEqual([])
  })

  it('produces one instance per repeater copy', () => {
    const result = evaluate(docWith((d) => { (d.layers[0].repeaters[0] as RadialConfig).count = 12 }))
    expect(result.totalInstances).toBe(12)
    expect(result.layers[0].instances).toHaveLength(12)
    expect(result.perLayerCounts[result.layers[0].layerId]).toBe(12)
  })

  it('produces a single instance when a layer has no repeaters', () => {
    const result = evaluate(docWith((d) => { d.layers[0].repeaters = [] }))
    expect(result.totalInstances).toBe(1)
  })

  it('skips hidden layers but keeps their slot', () => {
    const result = evaluate(docWith((d) => { d.layers[0].visible = false }))
    expect(result.totalInstances).toBe(0)
    expect(result.layers).toHaveLength(1)
    expect(result.layers[0].instances).toEqual([])
    expect(result.truncated).toBe(false)
  })

  it('reuses one Path object when the shape is constant', () => {
    const result = evaluate(docWith((d) => { (d.layers[0].repeaters[0] as RadialConfig).count = 5 }))
    const paths = result.layers[0].instances.map((i) => i.path)
    expect(new Set(paths).size).toBe(1)
  })

  it('rebuilds the path per instance when a shape field is modulated', () => {
    const result = evaluate(
      docWith((d) => {
        ;(d.layers[0].repeaters[0] as RadialConfig).count = 4
        d.layers[0].shape = {
          type: 'polygon',
          sides: { base: 3, to: 8, source: 'index', curve: 'linear' },
          radius: 60,
          rotation: 0,
        }
      }),
    )
    const paths = result.layers[0].instances.map((i) => i.path)
    expect(new Set(paths).size).toBe(4)
    const sideCounts = paths.map((p) => p.segments.filter((s) => s.c !== 'Z').length)
    expect(sideCounts).toEqual([3, 5, 6, 8])
  })

  it('resolves colour channels per instance', () => {
    const result = evaluate(
      docWith((d) => {
        ;(d.layers[0].repeaters[0] as RadialConfig).count = 3
        d.layers[0].style.fill = {
          l: 0.6,
          c: 0.2,
          h: { base: 0, to: 100, source: 'index', curve: 'linear' },
          a: 0.5,
        }
      }),
    )
    expect(result.layers[0].instances.map((i) => i.style.fill!.h)).toEqual([0, 50, 100])
  })

  it('positions copies around the canvas origin', () => {
    const result = evaluate(
      docWith((d) => {
        d.layers[0].repeaters[0] = { type: 'radial', count: 4, radius: 100, startAngle: 0, spin: 0 }
      }),
    )
    const origins = result.layers[0].instances.map((i) => applyPoint(i.transform, { x: 0, y: 0 }))
    expect(origins[0].x).toBeCloseTo(100, 6)
    expect(origins[0].y).toBeCloseTo(0, 6)
    expect(origins[2].x).toBeCloseTo(-100, 6)
  })

  it('stops at maxInstances and reports truncation', () => {
    const result = evaluate(
      docWith((d) => {
        d.maxInstances = 10
        ;(d.layers[0].repeaters[0] as RadialConfig).count = 50
      }),
    )
    expect(result.totalInstances).toBe(10)
    expect(result.truncated).toBe(true)
  })

  it('does not report truncation when it fits', () => {
    expect(evaluate(docWith()).truncated).toBe(false)
  })

  it('does not materialise placements beyond the budget', () => {
    const start = performance.now()
    const result = evaluate(
      docWith((d) => {
        d.maxInstances = 10
        ;(d.layers[0].repeaters[0] as RadialConfig).count = 10_000_000
      }),
    )
    expect(result.totalInstances).toBe(10)
    expect(result.truncated).toBe(true)
    // Ten million Placement objects would take seconds and hundreds of MB.
    expect(performance.now() - start).toBeLessThan(1000)
  })

  it('sets flatIndex and total on the context used for styling', () => {
    const result = evaluate(
      docWith((d) => {
        ;(d.layers[0].repeaters[0] as RadialConfig).count = 4
        d.layers[0].style.fill = {
          l: { base: 0, to: 1, source: 'flatIndex', curve: 'linear' },
          c: 0.1,
          h: 200,
          a: 1,
        }
      }),
    )
    expect(result.layers[0].instances.map((i) => i.style.fill!.l)).toEqual([0, 1 / 3, 2 / 3, 1])
  })
})

describe('per-level counts', () => {
  it('reports the cumulative count after each link of the chain', () => {
    // 3 and 4, not 3 and 3: distinct numbers at every level mean a cumulative
    // count can never be mistaken for a per-level one, nor either for the
    // layer total.
    const doc = emptyDocument()
    const layer = defaultLayer('halo')
    layer.repeaters = [
      { type: 'radial', count: 3, radius: 100, startAngle: 0, spin: 0 },
      { type: 'grid', rows: 2, cols: 2, spacingX: 10, spacingY: 10, spin: 0 },
    ]
    doc.layers.push(layer)

    const result = evaluate(doc)
    expect(result.perLayerLevelCounts[layer.id]).toEqual([3, 12])
    expect(result.perLayerCounts[layer.id]).toBe(12)
  })

  it('reports one entry per link even for a single-repeater chain', () => {
    const doc = emptyDocument()
    const layer = defaultLayer('halo')
    doc.layers.push(layer)
    expect(evaluate(doc).perLayerLevelCounts[layer.id]).toEqual([12])
  })

  it('gives a hidden layer an empty level list', () => {
    const doc = emptyDocument()
    const layer = defaultLayer('halo')
    layer.visible = false
    doc.layers.push(layer)
    expect(evaluate(doc).perLayerLevelCounts[layer.id]).toEqual([])
  })

  it('composes the chain in order, not merely to the right total', () => {
    // [radial(3), grid(2x2)] and [grid(2x2), radial(3)] both yield 12
    // instances, so a total-only assertion passes against a chain composed
    // backwards. Assert a position instead.
    const build = (repeaters: RepeaterConfig[]) => {
      const doc = emptyDocument()
      const layer = defaultLayer('halo')
      layer.shape = { type: 'polygon', sides: 4, radius: 1, rotation: 0 }
      layer.repeaters = repeaters
      doc.layers.push(layer)
      return evaluate(doc).layers[0].instances
    }
    const radialFirst = build([
      { type: 'radial', count: 3, radius: 100, startAngle: 0, spin: 0 },
      { type: 'grid', rows: 2, cols: 2, spacingX: 10, spacingY: 10, spin: 0 },
    ])
    const gridFirst = build([
      { type: 'grid', rows: 2, cols: 2, spacingX: 10, spacingY: 10, spin: 0 },
      { type: 'radial', count: 3, radius: 100, startAngle: 0, spin: 0 },
    ])

    expect(radialFirst).toHaveLength(12)
    expect(gridFirst).toHaveLength(12)

    // Radial first: instance 0 is the first grid cell around the first ring
    // copy, so it sits at (100, 0) + (-5, -5).
    const a = applyPoint(radialFirst[0].transform, { x: 0, y: 0 })
    expect(a.x).toBeCloseTo(95, 9)
    expect(a.y).toBeCloseTo(-5, 9)

    // Grid first: instance 0 is the first ring copy around the first grid
    // cell, so it sits at (-5, -5) + (100, 0).
    const b = applyPoint(gridFirst[0].transform, { x: 0, y: 0 })
    expect(b.x).toBeCloseTo(95, 9)
    expect(b.y).toBeCloseTo(-5, 9)

    // Those two coincide, which is exactly why a single sample proves
    // nothing. Instance 1 is where the orders diverge: radial-first steps to
    // the next grid cell (+10 in x), grid-first steps to the next ring copy.
    const a1 = applyPoint(radialFirst[1].transform, { x: 0, y: 0 })
    expect(a1.x).toBeCloseTo(105, 9)
    expect(a1.y).toBeCloseTo(-5, 9)

    const b1 = applyPoint(gridFirst[1].transform, { x: 0, y: 0 })
    expect(b1.x).toBeCloseTo(-5 + 100 * Math.cos((2 * Math.PI) / 3), 9)
    expect(b1.y).toBeCloseTo(-5 + 100 * Math.sin((2 * Math.PI) / 3), 9)
  })
})
