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
})
