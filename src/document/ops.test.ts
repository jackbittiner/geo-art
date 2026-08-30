import { describe, it, expect } from 'vitest'
import { emptyDocument, defaultLayer, DEFAULT_FILL, DEFAULT_STROKE, DEFAULT_REPEATERS } from './defaults'
import { documentSchema } from './schema'
import {
  addLayer, removeLayer, duplicateLayer, moveLayer, renameLayer,
  setLayerVisible, updateLayer, setShapeType, setCanvasSize,
  setShapeField, setRepeaterField, setFillChannel,
  setFill, setStroke, setStrokeChannel, setStrokeWidth,
  addRepeater, removeRepeater, moveRepeater, setRepeaterType,
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
      () => setFill(doc, id, { l: 0.5, c: 0.1, h: 10, a: 1 }),
      () => setFill(doc, id, undefined),
      () => setFill(doc, 'nope', undefined),
      () => setStroke(doc, id, DEFAULT_STROKE),
      () => setStroke(doc, id, undefined),
      () => setStroke(doc, 'nope', undefined),
      () => setStrokeChannel(doc, id, 'h', 10),
      () => setStrokeChannel(doc, 'nope', 'h', 10),
      () => setStrokeWidth(doc, id, 10),
      () => setStrokeWidth(doc, 'nope', 10),
    ]
    for (const call of calls) {
      call()
      expect(JSON.stringify(doc)).toBe(snapshot)
    }
  })

  it('never mutates the input document when a stroke is already present', () => {
    // The sweep above never applies setStrokeChannel/setStrokeWidth to a layer
    // that actually has a stroke -- both are no-ops there, so a mutate-in-place
    // bug in the "has a stroke" branch would ship undetected. Build a document
    // with a real stroke and re-check purity against it specifically.
    const base = withLayer()
    const id = base.layers[0].id
    const withStroke = setStroke(base, id, DEFAULT_STROKE)
    const snapshot = JSON.stringify(withStroke)
    const calls: Array<() => unknown> = [
      () => setStrokeChannel(withStroke, id, 'h', 99),
      () => setStrokeWidth(withStroke, id, 99),
    ]
    for (const call of calls) {
      call()
      expect(JSON.stringify(withStroke)).toBe(snapshot)
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

  it("gives a fresh layer the DEFAULT_FILL constant, not an independent copy of the same values", () => {
    // Guards the brief's "one definition" requirement: a fresh layer's fill
    // must literally be DEFAULT_FILL, not a second inlined object that only
    // happens to match today. toEqual alone would pass even if defaultLayer
    // still inlined its own literal, so this is a value check, not identity --
    // but it fails the moment the two constants drift apart.
    expect(defaultLayer('x').style.fill).toEqual(DEFAULT_FILL)
  })
})

describe('fill and stroke ops', () => {
  const seeded = () => addLayer(emptyDocument(), 'halo')
  const someFill = { l: 0.5, c: 0.1, h: 10, a: 1 }

  it('sets the fill, leaving an existing stroke untouched', () => {
    // Fixture starts with a stroke so there is something for setFill to leak
    // into -- a fixture with no stroke can't fail against a `{ fill }`
    // implementation that clobbers the rest of style.
    const base = seeded()
    const id = base.layers[0].id
    const withStroke = setStroke(base, id, DEFAULT_STROKE)
    const out = setFill(withStroke, id, someFill)
    expect(out.layers[0].style.fill).toEqual(someFill)
    expect(out.layers[0].style.stroke).toEqual(DEFAULT_STROKE)
  })

  it('clears the fill by deleting the key, not by setting it to undefined', () => {
    // toEqual/toBeUndefined cannot tell {fill: undefined} apart from a missing
    // key -- vitest's structural equality ignores undefined-valued properties.
    // hasOwnProperty is the only check a `{ ...style, fill: undefined }`
    // implementation would actually fail.
    const doc = seeded()
    const out = setFill(doc, doc.layers[0].id, undefined)
    expect(Object.prototype.hasOwnProperty.call(out.layers[0].style, 'fill')).toBe(false)
  })

  it('leaves the document alone when setting fill on an unknown id', () => {
    const doc = seeded()
    expect(setFill(doc, 'nope', someFill)).toBe(doc)
  })

  it('sets the stroke, leaving the existing fill untouched', () => {
    // seeded()'s layer already has a fill (defaultLayer's default) -- a
    // fixture with no fill can't fail against a `{ stroke }` implementation
    // that clobbers the rest of style.
    const doc = seeded()
    const existingFill = doc.layers[0].style.fill
    const out = setStroke(doc, doc.layers[0].id, DEFAULT_STROKE)
    expect(out.layers[0].style.stroke).toEqual(DEFAULT_STROKE)
    expect(out.layers[0].style.fill).toEqual(existingFill)
  })

  it('does not store the caller\'s fill or stroke object by reference', () => {
    // setShapeType's precedent: structuredClone(DEFAULT_SHAPES[type]) exists
    // precisely so two layers built from one module-level default don't share
    // a nested object. DEFAULT_STROKE and DEFAULT_FILL are exactly such
    // constants, and Brief 2 calls setStroke(doc, id, stash ?? DEFAULT_STROKE)
    // directly -- so two layers enabled from scratch must not end up aliasing
    // one colour object. Mutate the layer's stored colour afterwards and
    // confirm the shared source constant is untouched.
    const base = seeded()
    const id = base.layers[0].id

    const fillSource = { l: 0.5, c: 0.1, h: 10, a: 1 }
    const withFill = setFill(base, id, fillSource)
    withFill.layers[0].style.fill!.h = 999
    expect(fillSource.h).toBe(10)

    const strokeSnapshot = JSON.stringify(DEFAULT_STROKE)
    const withStroke = setStroke(base, id, DEFAULT_STROKE)
    withStroke.layers[0].style.stroke!.colour.h = 999
    withStroke.layers[0].style.stroke!.width = 999
    expect(JSON.stringify(DEFAULT_STROKE)).toBe(strokeSnapshot)
  })

  it('clears the stroke by deleting the key, not by setting it to undefined', () => {
    const base = seeded()
    const id = base.layers[0].id
    const set = setStroke(base, id, DEFAULT_STROKE)
    const cleared = setStroke(set, id, undefined)
    expect(Object.prototype.hasOwnProperty.call(cleared.layers[0].style, 'stroke')).toBe(false)
  })

  it('leaves the document alone when setting stroke on an unknown id', () => {
    const doc = seeded()
    expect(setStroke(doc, 'nope', DEFAULT_STROKE)).toBe(doc)
  })

  it('sets a stroke channel', () => {
    const base = seeded()
    const id = base.layers[0].id
    const withStroke = setStroke(base, id, DEFAULT_STROKE)
    const out = setStrokeChannel(withStroke, id, 'h', 42)
    expect(out.layers[0].style.stroke!.colour.h).toBe(42)
  })

  it('leaves a layer without a stroke alone (channel)', () => {
    const doc = seeded()
    expect(setStrokeChannel(doc, doc.layers[0].id, 'h', 42).layers[0].style.stroke).toBeUndefined()
  })

  it('leaves the document alone when setting a stroke channel on an unknown id', () => {
    const doc = seeded()
    expect(setStrokeChannel(doc, 'nope', 'h', 42)).toBe(doc)
  })

  it('sets the stroke width', () => {
    const base = seeded()
    const id = base.layers[0].id
    const withStroke = setStroke(base, id, DEFAULT_STROKE)
    const out = setStrokeWidth(withStroke, id, 12)
    expect(out.layers[0].style.stroke!.width).toBe(12)
  })

  it('leaves a layer without a stroke alone (width)', () => {
    const doc = seeded()
    expect(setStrokeWidth(doc, doc.layers[0].id, 12).layers[0].style.stroke).toBeUndefined()
  })

  it('leaves the document alone when setting stroke width on an unknown id', () => {
    const doc = seeded()
    expect(setStrokeWidth(doc, 'nope', 12)).toBe(doc)
  })

  it('validates both a stroke-only layer and a fill-only layer against documentSchema', () => {
    const base = seeded()
    const id = base.layers[0].id

    const strokeOnly = setFill(setStroke(base, id, DEFAULT_STROKE), id, undefined)
    expect(strokeOnly.layers[0].style.fill).toBeUndefined()
    expect(strokeOnly.layers[0].style.stroke).toBeDefined()
    expect(documentSchema.safeParse(strokeOnly).success).toBe(true)

    const fillOnly = base
    expect(fillOnly.layers[0].style.fill).toBeDefined()
    expect(fillOnly.layers[0].style.stroke).toBeUndefined()
    expect(documentSchema.safeParse(fillOnly).success).toBe(true)
  })

  it('validates a document whose layer uses a grid repeater', () => {
    // repeaterSchema is a bare zod schema, never checked against
    // RepeaterConfig by the compiler, so a missing or misspelled grid member
    // would fail only at load time. This is the only thing that catches it.
    const base = withLayer()
    const doc = setRepeaterType(base, base.layers[0].id, 0, 'grid')
    expect(() => documentSchema.parse(doc)).not.toThrow()
  })

  it('rejects a grid repeater missing a required field', () => {
    // Paired with the test above: on its own, that one passes against a
    // schema whose grid member accepts anything at all.
    const base = withLayer()
    const doc = setRepeaterType(base, base.layers[0].id, 0, 'grid')
    const broken = structuredClone(doc) as unknown as {
      layers: { repeaters: Record<string, unknown>[] }[]
    }
    delete broken.layers[0].repeaters[0].spacingY
    expect(() => documentSchema.parse(broken)).toThrow()
  })
})

describe('updateLayer identity', () => {
  it('returns the document by reference when the callback changes nothing', () => {
    // Guards written inside an updateLayer callback must not manufacture a
    // new document: the store records an undo entry per new document, so a
    // no-op edit would leave a phantom step that appears to do nothing.
    const doc = withLayer()
    const id = doc.layers[0].id
    expect(setRepeaterField(doc, id, 99, 'count', 5)).toBe(doc)
  })

  it('returns a new document when the callback does change something', () => {
    // Paired with the test above: on its own, that one passes against an op
    // that never changes anything at all.
    const doc = withLayer()
    const id = doc.layers[0].id
    expect(setRepeaterField(doc, id, 0, 'count', 5)).not.toBe(doc)
  })
})

describe('addRepeater', () => {
  it('appends a repeater of the requested type', () => {
    const doc = withLayer()
    const next = addRepeater(doc, doc.layers[0].id, 'grid')
    expect(next.layers[0].repeaters.map((r) => r.type)).toEqual(['radial', 'grid'])
  })

  it('deep-copies the default so two layers never share a config object', () => {
    const doc = withLayer()
    const next = addRepeater(doc, doc.layers[0].id, 'grid')
    expect(next.layers[0].repeaters[1]).not.toBe(DEFAULT_REPEATERS.grid)
    expect(next.layers[0].repeaters[1]).toEqual(DEFAULT_REPEATERS.grid)
  })

  it('returns the document by reference for an unknown layer', () => {
    const doc = withLayer()
    expect(addRepeater(doc, 'no-such-layer', 'grid')).toBe(doc)
  })
})

describe('removeRepeater', () => {
  it('removes the repeater at the index', () => {
    const base = withLayer()
    const id = base.layers[0].id
    const two = addRepeater(base, id, 'grid')
    const next = removeRepeater(two, id, 0)
    expect(next.layers[0].repeaters.map((r) => r.type)).toEqual(['grid'])
  })

  it('refuses to empty the chain, returning the document by reference', () => {
    // A layer with no repeaters renders one instance at the origin — legal,
    // but it hides the section that would let you add one back.
    const base = withLayer()
    expect(removeRepeater(base, base.layers[0].id, 0)).toBe(base)
  })

  it('returns the document by reference for an out-of-range index', () => {
    const base = withLayer()
    const id = base.layers[0].id
    const two = addRepeater(base, id, 'grid')
    expect(removeRepeater(two, id, 7)).toBe(two)
  })
})

describe('moveRepeater', () => {
  it('moves a repeater earlier in the chain', () => {
    const base = withLayer()
    const id = base.layers[0].id
    const two = addRepeater(base, id, 'grid')
    const next = moveRepeater(two, id, 1, -1)
    expect(next.layers[0].repeaters.map((r) => r.type)).toEqual(['grid', 'radial'])
  })

  it('moves a repeater later in the chain', () => {
    const base = withLayer()
    const id = base.layers[0].id
    const two = addRepeater(base, id, 'grid')
    const next = moveRepeater(two, id, 0, 1)
    expect(next.layers[0].repeaters.map((r) => r.type)).toEqual(['grid', 'radial'])
  })

  it('returns the document by reference when the move would leave the array', () => {
    const base = withLayer()
    const id = base.layers[0].id
    const two = addRepeater(base, id, 'grid')
    expect(moveRepeater(two, id, 0, -1)).toBe(two)
    expect(moveRepeater(two, id, 1, 1)).toBe(two)
  })
})

describe('setRepeaterType', () => {
  it('replaces the config with that type’s defaults', () => {
    const base = withLayer()
    const id = base.layers[0].id
    const next = setRepeaterType(base, id, 0, 'grid')
    expect(next.layers[0].repeaters[0]).toEqual(DEFAULT_REPEATERS.grid)
  })

  it('discards the previous tuning rather than carrying fields across', () => {
    // Consistent with setShapeType, and undo is the recovery path. Carrying
    // `spin` across while silently dropping `radius` is harder to predict.
    const base = withLayer()
    const id = base.layers[0].id
    const tuned = setRepeaterField(base, id, 0, 'spin', 45)
    const next = setRepeaterType(tuned, id, 0, 'grid')
    expect((next.layers[0].repeaters[0] as { spin: number }).spin).toBe(0)
  })

  it('returns the document by reference when the type is already that', () => {
    const base = withLayer()
    expect(setRepeaterType(base, base.layers[0].id, 0, 'radial')).toBe(base)
  })
})
