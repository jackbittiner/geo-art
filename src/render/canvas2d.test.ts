import { describe, it, expect, vi } from 'vitest'
import { Canvas2DRenderer } from './canvas2d'
import { DEFAULT_VIEWPORT, type Scene } from './renderer'
import type { Instance } from '../geometry/instance'
import { IDENTITY, translate } from '../geometry/transform'
import type { Path } from '../geometry/path'

const path: Path = { segments: [{ c: 'M', p: { x: 0, y: 0 } }, { c: 'Z' }] }

function instance(over: Partial<Instance> = {}): Instance {
  return {
    path,
    transform: IDENTITY,
    style: { fill: { l: 0.6, c: 0.2, h: 100, a: 0.5 } },
    ...over,
  }
}

function fakeContext() {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  }
}

function scene(over: Partial<Scene> = {}): Scene {
  return {
    background: { l: 1, c: 0, h: 0, a: 1 },
    width: 200,
    height: 100,
    layers: [{ instances: [instance()] }],
    ...over,
  }
}

describe('Canvas2DRenderer', () => {
  it('clears and paints the background before drawing', () => {
    const ctx = fakeContext()
    new Canvas2DRenderer(ctx, () => ({})).draw(scene(), DEFAULT_VIEWPORT)
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 200, 100)
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 200, 100)
  })

  // clearRect/fillRect being called with the right rectangle says nothing
  // about the colour: the background could be painted magenta and every other
  // test would still pass. fillStyle is mutable and reassigned per instance,
  // so it has to be captured inside the fillRect call, exactly as the
  // painter-order test captures it inside fill.
  it('paints the background in the scene background colour', () => {
    const ctx = fakeContext()
    let painted: string | null = null
    ctx.fillRect.mockImplementation(() => {
      painted = ctx.fillStyle
    })
    const background = { l: 0.62, c: 0.18, h: 280, a: 0.35 }
    new Canvas2DRenderer(ctx, () => ({})).draw(scene({ background }), DEFAULT_VIEWPORT)
    expect(painted).toBe('oklch(62% 0.18 280 / 0.35)')
  })

  it('fills once per instance', () => {
    const ctx = fakeContext()
    const layers = [{ instances: [instance(), instance(), instance()] }]
    new Canvas2DRenderer(ctx, () => ({})).draw(scene({ layers }), DEFAULT_VIEWPORT)
    expect(ctx.fill).toHaveBeenCalledTimes(3)
  })

  it('reuses one Path2D across instances that share a Path object', () => {
    const ctx = fakeContext()
    const factory = vi.fn(() => ({}))
    const layers = [{ instances: [instance(), instance(), instance()] }]
    new Canvas2DRenderer(ctx, factory).draw(scene({ layers }), DEFAULT_VIEWPORT)
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('draws layers in painter order, bottom first', () => {
    const ctx = fakeContext()
    const order: string[] = []
    ctx.fill.mockImplementation(() => order.push(ctx.fillStyle))
    const layers = [
      { instances: [instance({ style: { fill: { l: 0.1, c: 0, h: 0, a: 1 } } })] },
      { instances: [instance({ style: { fill: { l: 0.9, c: 0, h: 0, a: 1 } } })] },
    ]
    new Canvas2DRenderer(ctx, () => ({})).draw(scene({ layers }), DEFAULT_VIEWPORT)
    expect(order).toEqual(['oklch(10% 0 0 / 1)', 'oklch(90% 0 0 / 1)'])
  })

  it('centres the document origin and applies pan, zoom and dpr', () => {
    const ctx = fakeContext()
    const renderer = new Canvas2DRenderer(ctx, () => ({}))
    renderer.resize(200, 100, 2)
    const layers = [{ instances: [instance({ transform: translate(10, 0) })] }]
    renderer.draw(scene({ layers }), { pan: { x: 5, y: 0 }, zoom: 3 })
    // last setTransform call is the instance: dpr * (centre + pan + zoom * local)
    const last = ctx.setTransform.mock.calls.at(-1)
    expect(last).toEqual([6, 0, 0, 6, 2 * (100 + 5 + 3 * 10), 2 * 50])
  })

  it('skips instances with no fill and no stroke', () => {
    const ctx = fakeContext()
    const layers = [{ instances: [instance({ style: {} })] }]
    new Canvas2DRenderer(ctx, () => ({})).draw(scene({ layers }), DEFAULT_VIEWPORT)
    expect(ctx.fill).not.toHaveBeenCalled()
  })

  it('strokes when a stroke style is present', () => {
    const ctx = fakeContext()
    const style = { stroke: { colour: { l: 0.2, c: 0, h: 0, a: 1 }, width: 4 } }
    const layers = [{ instances: [instance({ style })] }]
    new Canvas2DRenderer(ctx, () => ({})).draw(scene({ layers }), DEFAULT_VIEWPORT)
    expect(ctx.stroke).toHaveBeenCalledTimes(1)
    expect(ctx.lineWidth).toBe(4)
  })
})
