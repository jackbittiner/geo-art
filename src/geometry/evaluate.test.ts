import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { applyPoint } from './transform'
import { emptyDocument, defaultLayer } from '../document/defaults'
import type { Document } from '../document/schema'

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
    const result = evaluate(docWith((d) => { d.layers[0].repeaters[0].count = 12 }))
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
  })

  it('reuses one Path object when the shape is constant', () => {
    const result = evaluate(docWith((d) => { d.layers[0].repeaters[0].count = 5 }))
    const paths = result.layers[0].instances.map((i) => i.path)
    expect(new Set(paths).size).toBe(1)
  })

  it('rebuilds the path per instance when a shape field is modulated', () => {
    const result = evaluate(
      docWith((d) => {
        d.layers[0].repeaters[0].count = 4
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
        d.layers[0].repeaters[0].count = 3
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
        d.layers[0].repeaters[0].count = 50
      }),
    )
    expect(result.totalInstances).toBe(10)
    expect(result.truncated).toBe(true)
  })

  it('does not report truncation when it fits', () => {
    expect(evaluate(docWith()).truncated).toBe(false)
  })

  it('sets flatIndex and total on the context used for styling', () => {
    const result = evaluate(
      docWith((d) => {
        d.layers[0].repeaters[0].count = 4
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
