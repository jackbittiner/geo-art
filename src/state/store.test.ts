import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from './store'
import { emptyDocument } from '../document/defaults'
import { removeLayer, setCanvasSize } from '../document/ops'
import { emptyHistory } from './history'

describe('store', () => {
  beforeEach(() => {
    useStore.setState({
      doc: emptyDocument(),
      selectedLayerId: null,
      viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
      isDragging: false,
      history: emptyHistory(),
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

describe('history', () => {
  beforeEach(() => {
    useStore.setState({
      doc: emptyDocument(),
      selectedLayerId: null,
      viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
      isDragging: false,
      history: emptyHistory(),
    })
  })

  it('records the pre-edit document when an op changes it', () => {
    useStore.getState().addAndSelectLayer('halo')
    useStore.getState().apply((d) => setCanvasSize(d, 800, 600))
    const { history, doc } = useStore.getState()
    expect(doc.canvas.width).toBe(800)
    expect(history.past.at(-1)!.doc.canvas.width).toBe(1200)
  })

  it('records nothing when an op returns the document unchanged', () => {
    // ops return the input by reference for an unknown id; nothing happened,
    // so nothing should be undoable.
    const before = useStore.getState().history.past.length
    useStore.getState().apply((d) => removeLayer(d, 'no-such-layer'))
    expect(useStore.getState().history.past).toHaveLength(before)
  })

  it('undo restores the previous document', () => {
    useStore.getState().apply((d) => setCanvasSize(d, 800, 600))
    useStore.getState().undo()
    expect(useStore.getState().doc.canvas.width).toBe(1200)
  })

  it('redo re-applies it', () => {
    useStore.getState().apply((d) => setCanvasSize(d, 800, 600))
    useStore.getState().undo()
    useStore.getState().redo()
    expect(useStore.getState().doc.canvas.width).toBe(800)
  })

  it('undo does nothing when there is no history', () => {
    const before = useStore.getState().doc
    useStore.getState().undo()
    expect(useStore.getState().doc).toBe(before)
  })

  it('coalesces consecutive edits carrying the same key', () => {
    useStore.getState().apply((d) => setCanvasSize(d, 800, 600), 'canvas-width')
    useStore.getState().apply((d) => setCanvasSize(d, 900, 600), 'canvas-width')
    expect(useStore.getState().history.past).toHaveLength(1)
    useStore.getState().undo()
    // One undo returns to before the whole gesture, not to the middle of it.
    expect(useStore.getState().doc.canvas.width).toBe(1200)
  })

  it('endCoalesce closes the group so the next edit is its own entry', () => {
    useStore.getState().apply((d) => setCanvasSize(d, 800, 600), 'canvas-width')
    useStore.getState().endCoalesce()
    useStore.getState().apply((d) => setCanvasSize(d, 900, 600), 'canvas-width')
    expect(useStore.getState().history.past).toHaveLength(2)
  })

  it('setDoc records, so a load is undoable', () => {
    useStore.getState().addAndSelectLayer('halo')
    const loaded = emptyDocument()
    useStore.getState().setDoc(loaded)
    expect(useStore.getState().doc.layers).toHaveLength(0)
    useStore.getState().undo()
    expect(useStore.getState().doc.layers).toHaveLength(1)
  })

  it('hydrateDoc does not record, because nothing precedes a restore', () => {
    const restored = emptyDocument()
    useStore.getState().hydrateDoc(restored)
    expect(useStore.getState().history.past).toHaveLength(0)
    expect(useStore.getState().doc).toBe(restored)
  })

  it('reconciles the selection when the restored document lacks the selected layer', () => {
    useStore.getState().addAndSelectLayer('halo')
    const id = useStore.getState().doc.layers[0].id
    expect(useStore.getState().selectedLayerId).toBe(id)
    useStore.getState().undo() // back to the empty document
    expect(useStore.getState().selectedLayerId).toBeNull()
  })
})
