import type { Viewport } from '../render/renderer'

const MIN_ZOOM = 0.02
const MAX_ZOOM = 64
const FIT_MARGIN = 0.9

type Size = { width: number; height: number }

export function fitViewport(canvas: Size, view: Size): Viewport {
  const byWidth = view.width / Math.max(1, canvas.width)
  const byHeight = view.height / Math.max(1, canvas.height)
  const raw = Math.min(byWidth, byHeight) * FIT_MARGIN
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, raw || MIN_ZOOM))
  return { pan: { x: 0, y: 0 }, zoom }
}

export function zoomAt(
  viewport: Viewport,
  factor: number,
  pointer: { x: number; y: number },
  view: Size,
): Viewport {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom * factor))
  const cx = view.width / 2
  const cy = view.height / 2
  // The document point currently under the pointer must stay under it.
  const dx = (pointer.x - cx - viewport.pan.x) / viewport.zoom
  const dy = (pointer.y - cy - viewport.pan.y) / viewport.zoom
  return { zoom, pan: { x: pointer.x - cx - zoom * dx, y: pointer.y - cy - zoom * dy } }
}

export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, pan: { x: viewport.pan.x + dx, y: viewport.pan.y + dy } }
}
