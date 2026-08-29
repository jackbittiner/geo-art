import { useCallback, useEffect, useRef } from 'react'
import { buildScene } from '../render/scene'
import { createCanvasRenderer, type Canvas2DRenderer } from '../render/canvas2d'
import { useStore } from '../state/store'
import { useEvaluation } from './useEvaluation'
import { fitViewport, panBy, zoomAt } from './viewport'

export default function CanvasView() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<Canvas2DRenderer | null>(null)
  const frameRef = useRef(0)

  const doc = useStore((s) => s.doc)
  const viewport = useStore((s) => s.viewport)
  const viewSize = useStore((s) => s.viewSize)
  const setViewport = useStore((s) => s.setViewport)
  const setViewSize = useStore((s) => s.setViewSize)
  const setDragging = useStore((s) => s.setDragging)
  const result = useEvaluation()

  /**
   * The canvas element's CSS-pixel size, falling back to the document's own
   * canvas size before layout has given the element one (and under jsdom,
   * where clientWidth is always 0). Reads the store directly so the listeners
   * below can be attached once without going stale.
   */
  const measure = useCallback(() => {
    const canvas = canvasRef.current
    const page = useStore.getState().doc.canvas
    return {
      width: canvas?.clientWidth || page.width,
      height: canvas?.clientHeight || page.height,
    }
  }, [])

  const fit = useCallback(() => {
    setViewport(fitViewport(useStore.getState().doc.canvas, measure()))
  }, [measure, setViewport])

  // Create the renderer once.
  useEffect(() => {
    if (canvasRef.current && !rendererRef.current) {
      rendererRef.current = createCanvasRenderer(canvasRef.current)
    }
  }, [])

  // Redraw on any change, coalesced to one frame.
  useEffect(() => {
    const canvas = canvasRef.current
    const renderer = rendererRef.current
    if (!canvas || !renderer) return

    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1
      const width = canvas.clientWidth || doc.canvas.width
      const height = canvas.clientHeight || doc.canvas.height
      const deviceWidth = Math.round(width * dpr)
      const deviceHeight = Math.round(height * dpr)
      // Assigning canvas.width/height reallocates and clears the backing store
      // even when the value is unchanged, so only do it on an actual resize --
      // a slider drag redraws on every pointermove and must not pay for that.
      if (canvas.width !== deviceWidth || canvas.height !== deviceHeight) {
        canvas.width = deviceWidth
        canvas.height = deviceHeight
      }
      renderer.resize(width, height, dpr)
      renderer.draw({ ...buildScene(doc, result), width, height }, viewport)
    })
    return () => cancelAnimationFrame(frameRef.current)
  }, [doc, result, viewport, viewSize])

  // Publish the pane's size to the store: the Fit control lives in TopBar and
  // must not reach into this component's DOM to find out how big the view is.
  // A resize also has to trigger a redraw, which it does via the viewSize
  // dependency of the draw effect above.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const report = () => setViewSize(measure())
    report()
    const observer = new ResizeObserver(report)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [measure, setViewSize])

  // Fit on mount, and refit whenever the document's canvas dimensions change --
  // loading a starter or a file of a different size must frame itself.
  useEffect(() => {
    if (!canvasRef.current) return
    fit()
  }, [doc.canvas.width, doc.canvas.height, fit])

  // React registers `wheel` at the root container as a passive listener, so a
  // preventDefault() inside a JSX onWheel handler is silently ignored and the
  // browser's own gesture (trackpad back-navigation on macOS) still fires.
  // Attaching directly to the element with { passive: false } is the only way
  // to make the cancellation stick.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const current = useStore.getState().viewport
      setViewport(zoomAt(current, Math.exp(-e.deltaY * 0.0015), pointer, measure()))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [measure, setViewport])

  return (
    <canvas
      data-testid="art-canvas"
      ref={canvasRef}
      tabIndex={0}
      aria-label="Artwork canvas"
      className="h-full w-full cursor-grab outline-none"
      onKeyDown={(e) => {
        if (e.key === 'f' || e.key === 'F') fit()
      }}
      onPointerDown={(e) => {
        if (e.button !== 1 && !e.shiftKey) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setDragging(true)
      }}
      onPointerMove={(e) => {
        if (!useStore.getState().isDragging) return
        setViewport(panBy(useStore.getState().viewport, e.movementX, e.movementY))
      }}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId)
        setDragging(false)
      }}
    />
  )
}
