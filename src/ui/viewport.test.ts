import { describe, it, expect } from 'vitest'
import { fitViewport, zoomAt, panBy } from './viewport'

const view = { width: 800, height: 600 }

describe('fitViewport', () => {
  it('fits by the tighter axis with a margin', () => {
    expect(fitViewport({ width: 1200, height: 1200 }, view).zoom).toBeCloseTo((600 / 1200) * 0.9)
  })

  it('centres the document', () => {
    expect(fitViewport({ width: 1200, height: 1200 }, view).pan).toEqual({ x: 0, y: 0 })
  })

  it('never returns a zero or negative zoom', () => {
    expect(fitViewport({ width: 1200, height: 1200 }, { width: 0, height: 0 }).zoom).toBeGreaterThan(0)
  })
})

describe('zoomAt', () => {
  it('multiplies the zoom', () => {
    const out = zoomAt({ pan: { x: 0, y: 0 }, zoom: 1 }, 2, { x: 400, y: 300 }, view)
    expect(out.zoom).toBe(2)
  })

  it('keeps the document point under the pointer fixed', () => {
    const before = { pan: { x: 10, y: -20 }, zoom: 1.5 }
    const pointer = { x: 250, y: 100 }
    const centre = { x: view.width / 2, y: view.height / 2 }
    const docPoint = {
      x: (pointer.x - centre.x - before.pan.x) / before.zoom,
      y: (pointer.y - centre.y - before.pan.y) / before.zoom,
    }
    const after = zoomAt(before, 1.7, pointer, view)
    expect(centre.x + after.pan.x + after.zoom * docPoint.x).toBeCloseTo(pointer.x, 6)
    expect(centre.y + after.pan.y + after.zoom * docPoint.y).toBeCloseTo(pointer.y, 6)
  })

  it('clamps zoom to a sane range', () => {
    expect(zoomAt({ pan: { x: 0, y: 0 }, zoom: 1 }, 1000, { x: 0, y: 0 }, view).zoom).toBeLessThanOrEqual(64)
    expect(zoomAt({ pan: { x: 0, y: 0 }, zoom: 1 }, 0.00001, { x: 0, y: 0 }, view).zoom).toBeGreaterThanOrEqual(0.02)
  })
})

describe('panBy', () => {
  it('adds to the pan', () => {
    expect(panBy({ pan: { x: 1, y: 2 }, zoom: 1 }, 10, -5).pan).toEqual({ x: 11, y: -3 })
  })
})
