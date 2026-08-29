import { useEffect, useRef } from 'react'
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
  const setViewport = useStore((s) => s.setViewport)
  const setDragging = useStore((s) => s.setDragging)
  const result = useEvaluation()

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
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      renderer.resize(width, height, dpr)
      renderer.draw({ ...buildScene(doc, result), width, height }, viewport)
    })
    return () => cancelAnimationFrame(frameRef.current)
  }, [doc, result, viewport])

  // Redraw when the pane resizes.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const observer = new ResizeObserver(() => setViewport({ ...useStore.getState().viewport }))
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [setViewport])

  // Fit once, when the canvas first has a size.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    setViewport(
      fitViewport(doc.canvas, {
        width: canvas.clientWidth || doc.canvas.width,
        height: canvas.clientHeight || doc.canvas.height,
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const view = () => ({
    width: canvasRef.current?.clientWidth || doc.canvas.width,
    height: canvasRef.current?.clientHeight || doc.canvas.height,
  })

  return (
    <canvas
      data-testid="art-canvas"
      ref={canvasRef}
      className="h-full w-full cursor-grab"
      onWheel={(e) => {
        e.preventDefault()
        const rect = e.currentTarget.getBoundingClientRect()
        const pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top }
        setViewport(zoomAt(viewport, Math.exp(-e.deltaY * 0.0015), pointer, view()))
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
