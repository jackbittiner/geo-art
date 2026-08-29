// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import CanvasView from './CanvasView'
import { useStore } from '../state/store'
import { emptyDocument, defaultLayer } from '../document/defaults'
import { fitViewport, zoomAt } from './viewport'

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
  // React 19 registers `wheel` at the root container as a *passive* listener,
  // so a preventDefault() inside a JSX onWheel handler is ignored: the default
  // action (trackpad back-navigation on macOS) still fires while zooming. Only
  // a listener attached to the element with { passive: false } can cancel it,
  // and defaultPrevented is what proves the cancellation actually took.
  it('cancels the wheel event so the browser does not also gesture-navigate', () => {
    render(<CanvasView />)
    const canvasEl = screen.getByTestId('art-canvas')

    const event = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })
    canvasEl.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('refits the view when the document canvas dimensions change', () => {
    render(<CanvasView />)
    act(() => {
      useStore.setState({ viewport: { pan: { x: 120, y: -40 }, zoom: 0.02 } })
    })

    act(() => {
      useStore.setState((s) => ({
        doc: { ...s.doc, canvas: { ...s.doc.canvas, width: 400, height: 300 } },
      }))
    })

    const doc = useStore.getState().doc
    // jsdom reports zero client size, so the component measures against the
    // document's own canvas -- the same fallback the component uses.
    expect(useStore.getState().viewport).toEqual(
      fitViewport(doc.canvas, { width: doc.canvas.width, height: doc.canvas.height }),
    )
  })

  it('refits on F, so a view zoomed to the limit is recoverable from the keyboard', () => {
    render(<CanvasView />)
    act(() => {
      useStore.setState({ viewport: { pan: { x: 300, y: 300 }, zoom: 0.02 } })
    })

    fireEvent.keyDown(screen.getByTestId('art-canvas'), { key: 'f' })

    const doc = useStore.getState().doc
    expect(useStore.getState().viewport).toEqual(
      fitViewport(doc.canvas, { width: doc.canvas.width, height: doc.canvas.height }),
    )
  })

  it('publishes its measured size to the store for the Fit control', () => {
    render(<CanvasView />)
    const doc = useStore.getState().doc
    expect(useStore.getState().viewSize).toEqual({
      width: doc.canvas.width,
      height: doc.canvas.height,
    })
  })
})
