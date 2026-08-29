import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from './store'
import { emptyDocument } from '../document/defaults'
import { removeLayer } from '../document/ops'

describe('store', () => {
  beforeEach(() => {
    useStore.setState({
      doc: emptyDocument(),
      selectedLayerId: null,
      viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
      isDragging: false,
    })
  })

  it('starts with an empty document and nothing selected', () => {
    expect(useStore.getState().doc.layers).toEqual([])
    expect(useStore.getState().selectedLayerId).toBeNull()
  })

  it('adds a layer and selects it', () => {
    useStore.getState().addAndSelectLayer('halo')
    const { doc, selectedLayerId } = useStore.getState()
    expect(doc.layers).toHaveLength(1)
    expect(selectedLayerId).toBe(doc.layers[0].id)
  })

  it('applies a pure op', () => {
    useStore.getState().addAndSelectLayer('halo')
    const id = useStore.getState().doc.layers[0].id
    useStore.getState().apply((d) => removeLayer(d, id))
    expect(useStore.getState().doc.layers).toEqual([])
  })

  it('clears the selection when the selected layer disappears', () => {
    useStore.getState().addAndSelectLayer('halo')
    const id = useStore.getState().doc.layers[0].id
    useStore.getState().apply((d) => removeLayer(d, id))
    expect(useStore.getState().selectedLayerId).toBeNull()
  })

  it('keeps the selection when a different layer is removed', () => {
    useStore.getState().addAndSelectLayer('first')
    useStore.getState().addAndSelectLayer('second')
    const [first, second] = useStore.getState().doc.layers
    useStore.getState().select(second.id)
    useStore.getState().apply((d) => removeLayer(d, first.id))
    expect(useStore.getState().selectedLayerId).toBe(second.id)
  })

  it('tracks viewport and drag state', () => {
    useStore.getState().setViewport({ pan: { x: 4, y: 5 }, zoom: 2 })
    useStore.getState().setDragging(true)
    expect(useStore.getState().viewport.zoom).toBe(2)
    expect(useStore.getState().isDragging).toBe(true)
  })
  // CanvasView reports its size from a ResizeObserver, which fires for reasons
  // other than a size change. A fresh object each time would re-render every
  // subscriber and redraw the canvas, so an unchanged size must be a no-op.
  it('publishes the view size, and ignores a report of the same size', () => {
    useStore.getState().setViewSize({ width: 800, height: 600 })
    expect(useStore.getState().viewSize).toEqual({ width: 800, height: 600 })

    const before = useStore.getState().viewSize
    useStore.getState().setViewSize({ width: 800, height: 600 })
    expect(useStore.getState().viewSize).toBe(before)

    useStore.getState().setViewSize({ width: 801, height: 600 })
    expect(useStore.getState().viewSize).toEqual({ width: 801, height: 600 })
  })
})
