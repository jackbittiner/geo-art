// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import CanvasView from './CanvasView'
import { useStore } from '../state/store'
import { emptyDocument, defaultLayer } from '../document/defaults'
import { zoomAt } from './viewport'

beforeEach(() => {
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 1,
    setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(),
    fill: vi.fn(), stroke: vi.fn(),
  }
  vi.stubGlobal('Path2D', class { moveTo() {} lineTo() {} bezierCurveTo() {} closePath() {} })
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never
  const doc = emptyDocument()
  doc.layers.push(defaultLayer('halo'))
  useStore.setState({ doc, selectedLayerId: null, viewport: { pan: { x: 0, y: 0 }, zoom: 1 } })
})

describe('CanvasView', () => {
  it('renders a canvas element', () => {
    render(<CanvasView />)
    expect(screen.getByTestId('art-canvas')).toBeDefined()
  })

  it('zooms toward the cursor on wheel', () => {
    render(<CanvasView />)
    const canvasEl = screen.getByTestId('art-canvas') as HTMLCanvasElement

    // Give the canvas a non-zero, offset bounding box so the test actually
    // exercises the client-coordinate-to-canvas-relative-pointer translation
    // (jsdom's default getBoundingClientRect() is all zeros, which would let
    // a broken "e.clientX - rect.left" subtraction pass unnoticed).
    canvasEl.getBoundingClientRect = () =>
      ({ left: 20, top: 15, right: 820, bottom: 615, width: 800, height: 600, x: 20, y: 15, toJSON() {} }) as DOMRect

    const before = useStore.getState().viewport
    const clientPointer = { x: 520, y: 365 }
    const pointer = { x: clientPointer.x - 20, y: clientPointer.y - 15 } // canvas-relative

    // jsdom's canvas has zero clientWidth/clientHeight, so the component's
    // view() falls back to the document's own canvas size.
    const doc = useStore.getState().doc
    const view = {
      width: canvasEl.clientWidth || doc.canvas.width,
      height: canvasEl.clientHeight || doc.canvas.height,
    }
    const factor = Math.exp(-(-100) * 0.0015)
    const expected = zoomAt(before, factor, pointer, view)

    canvasEl.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -100,
        clientX: clientPointer.x,
        clientY: clientPointer.y,
        bubbles: true,
        cancelable: true,
      }),
    )

    const after = useStore.getState().viewport
    // Direction: scrolling up (negative deltaY) must zoom in, not out.
    expect(after.zoom).toBeGreaterThan(before.zoom)
    expect(after.zoom).toBeCloseTo(expected.zoom, 10)
    // Cursor anchoring: the pan must land exactly where zoomAt predicts,
    // using the pointer position relative to the canvas, not the viewport.
    expect(after.pan.x).toBeCloseTo(expected.pan.x, 6)
    expect(after.pan.y).toBeCloseTo(expected.pan.y, 6)
  })
})
