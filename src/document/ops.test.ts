import { describe, it, expect } from 'vitest'
import { emptyDocument } from './defaults'
import {
  addLayer, removeLayer, duplicateLayer, moveLayer, renameLayer,
  setLayerVisible, updateLayer, setShapeType, setCanvasSize,
  setShapeField, setRepeaterField, setFillChannel,
} from './ops'

const withLayer = () => addLayer(emptyDocument(), 'halo')

describe('document ops', () => {
  it('never mutates the input document', () => {
    const before = emptyDocument()
    const snapshot = JSON.stringify(before)
    addLayer(before, 'halo')
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('never mutates the input document, for every operation', () => {
    // The brief's own purity test only ever calls addLayer. That leaves the other
    // eight functions unchecked, so a mutate-in-place bug in, say, updateLayer
    // (e.g. `doc.layers[index] = fn(doc.layers[index]); return doc`) would ship
    // with every test green. Run the same before/after snapshot check through
    // each exported operation.
    const doc = addLayer(withLayer(), 'second')
    const id = doc.layers[0].id
    const snapshot = JSON.stringify(doc)
    const calls: Array<() => unknown> = [
      () => addLayer(doc, 'third'),
      () => removeLayer(doc, id),
      () => removeLayer(doc, 'nope'),
      () => duplicateLayer(doc, id),
      () => duplicateLayer(doc, 'nope'),
      () => moveLayer(doc, id, 1),
      () => moveLayer(doc, 'nope', 1),
      () => renameLayer(doc, id, 'ring'),
      () => setLayerVisible(doc, id, false),
      () => updateLayer(doc, id, (l) => ({ ...l, opacity: 0.2 })),
      () => setShapeType(doc, id, 'ellipse'),
      () => setCanvasSize(doc, 800, 600),
    ]
    for (const call of calls) {
      call()
      expect(JSON.stringify(doc)).toBe(snapshot)
    }
  })

  it('shares the untouched layer object between input and output (documented, safe sharing)', () => {
    // addLayer/updateLayer legitimately share layers they did not touch — this is
    // cheap and safe precisely because no op ever mutates a layer in place, it only
    // ever replaces references via spreads. Pin that sharing so a future change
    // that starts deep-cloning untouched layers (needless cost) or, worse, starts
    // mutating them in place (a correctness bug the identity check below would
    // catch, since a fresh clone or a mutated-then-restored object could still
    // pass a value-equality check) is a deliberate, visible decision.
    const before = withLayer()
    const after = addLayer(before, 'second')
    expect(after.layers[0]).toBe(before.layers[0])
  })

  it('duplicateLayer produces a layer with no shared nested objects with the source', () => {
    const doc = withLayer()
    const dup = duplicateLayer(doc, doc.layers[0].id)
    const original = dup.layers[0]
    const copy = dup.layers[1]
    expect(copy.shape).not.toBe(original.shape)
    expect(copy.style).not.toBe(original.style)
    expect(copy.repeaters).not.toBe(original.repeaters)
    // Mutating the copy's nested shape must not reach the original's.
    ;(copy.shape as { rotation: number }).rotation = 999
    expect((original.shape as { rotation: number }).rotation).not.toBe(999)
  })

  it('adds a layer on top', () => {
    const doc = addLayer(withLayer(), 'second')
    expect(doc.layers.map((l) => l.name)).toEqual(['halo', 'second'])
  })

  it('removes a layer by id', () => {
    const doc = withLayer()
    expect(removeLayer(doc, doc.layers[0].id).layers).toHaveLength(0)
  })

  it('leaves the document alone when removing an unknown id', () => {
    // Reference equality, not just length: moveLayer, duplicateLayer and
    // updateLayer all short-circuit to the same input reference on an unknown
    // id; removeLayer's `.filter()` allocated a fresh (same-length) document
    // regardless, so a length-only assertion would pass even without the
    // short-circuit.
    const doc = withLayer()
    expect(removeLayer(doc, 'nope')).toBe(doc)
  })

  it('duplicates a layer with a fresh id, directly after the original -- not at the end', () => {
    // Both layers in a two-layer fixture sit at index+1 == the end, so
    // `splice(index + 1, 0, copy)` and a plain `push` are indistinguishable
    // there. A three-layer fixture with the duplicate in the middle tells
    // them apart.
    let doc = addLayer(addLayer(withLayer(), 'middle'), 'top')
    const middleId = doc.layers[1].id
    doc = duplicateLayer(doc, middleId)
    expect(doc.layers.map((l) => l.name)).toEqual(['halo', 'middle', 'middle copy', 'top'])
    expect(doc.layers[2].id).not.toBe(middleId)
  })

  it('leaves the document alone when duplicating an unknown id', () => {
    const doc = withLayer()
    expect(duplicateLayer(doc, 'nope')).toBe(doc)
  })

  it('moves a layer up and down, clamping at the ends', () => {
    let doc = addLayer(withLayer(), 'second')
    const bottomId = doc.layers[0].id
    doc = moveLayer(doc, bottomId, 1)
    expect(doc.layers.map((l) => l.name)).toEqual(['second', 'halo'])
    doc = moveLayer(doc, bottomId, 5)
    expect(doc.layers.map((l) => l.name)).toEqual(['second', 'halo'])
  })

  it('leaves the document alone when moving an unknown id', () => {
    const doc = withLayer()
    expect(moveLayer(doc, 'nope', 1)).toBe(doc)
  })

  it('is a no-op when moving the top layer up or the bottom layer down', () => {
    const doc = addLayer(withLayer(), 'second')
    const topId = doc.layers[1].id
    const bottomId = doc.layers[0].id
    expect(moveLayer(doc, topId, 1)).toBe(doc)
    expect(moveLayer(doc, bottomId, -1)).toBe(doc)
  })

  it('renames and toggles visibility', () => {
    const doc = withLayer()
    const id = doc.layers[0].id
    expect(renameLayer(doc, id, 'ring').layers[0].name).toBe('ring')
    expect(setLayerVisible(doc, id, false).layers[0].visible).toBe(false)
  })

  it('leaves the document alone when renaming, toggling visibility, or updating an unknown id', () => {
    const doc = withLayer()
    expect(renameLayer(doc, 'nope', 'ring')).toBe(doc)
    expect(setLayerVisible(doc, 'nope', false)).toBe(doc)
    expect(updateLayer(doc, 'nope', (l) => ({ ...l, opacity: 0.1 }))).toBe(doc)
  })

  it('updates one layer through a callback', () => {
    const doc = withLayer()
    const id = doc.layers[0].id
    const out = updateLayer(doc, id, (l) => ({ ...l, opacity: 0.5 }))
    expect(out.layers[0].opacity).toBe(0.5)
  })

  it('swaps shape type to a valid default of the new type', () => {
    const doc = withLayer()
    const out = setShapeType(doc, doc.layers[0].id, 'ellipse')
    expect(out.layers[0].shape).toEqual({ type: 'ellipse', rx: 60, ry: 40, rotation: 0 })
  })

  it('leaves the document alone when setting shape type on an unknown id', () => {
    const doc = withLayer()
    expect(setShapeType(doc, 'nope', 'ellipse')).toBe(doc)
  })

  it('sets the canvas size', () => {
    expect(setCanvasSize(emptyDocument(), 800, 600).canvas).toMatchObject({ width: 800, height: 600 })
  })
})

describe('field setters', () => {
  const seeded = () => addLayer(emptyDocument(), 'halo')

  it('sets a shape field', () => {
    const doc = seeded()
    const out = setShapeField(doc, doc.layers[0].id, 'sides', 9)
    expect(out.layers[0].shape).toMatchObject({ sides: 9 })
  })

  it('sets a repeater field by chain index', () => {
    const doc = seeded()
    const out = setRepeaterField(doc, doc.layers[0].id, 0, 'count', 24)
    expect(out.layers[0].repeaters[0]).toMatchObject({ count: 24 })
  })

  it('ignores an out-of-range repeater index', () => {
    const doc = seeded()
    expect(setRepeaterField(doc, doc.layers[0].id, 7, 'count', 24)).toEqual(doc)
  })

  it('sets a fill channel', () => {
    const doc = seeded()
    const out = setFillChannel(doc, doc.layers[0].id, 'h', 42)
    expect(out.layers[0].style.fill!.h).toBe(42)
  })

  it('leaves a layer without a fill alone', () => {
    let doc = seeded()
    doc = updateLayer(doc, doc.layers[0].id, (l) => ({ ...l, style: {} }))
    expect(setFillChannel(doc, doc.layers[0].id, 'h', 42).layers[0].style.fill).toBeUndefined()
  })
})
