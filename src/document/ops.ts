import { DEFAULT_REPEATERS, defaultLayer, newId } from './defaults'
import type { Field } from '../geometry/field'
import type { RepeaterType } from '../geometry/repeaters'
import type { Colour, Document, Layer, LayerId, ShapeConfig, ShapeType } from './schema'

const DEFAULT_SHAPES: Record<ShapeType, ShapeConfig> = {
  polygon: { type: 'polygon', sides: 6, radius: 60, rotation: 0 },
  ellipse: { type: 'ellipse', rx: 60, ry: 40, rotation: 0 },
}

/** Builds the layer `addLayer` appends. `randomLayer` is the other one. */
export type LayerFactory = (name: string) => Layer

export function addLayer(
  doc: Document,
  name = 'layer',
  make: LayerFactory = defaultLayer,
): Document {
  return { ...doc, layers: [...doc.layers, make(name)] }
}

export function removeLayer(doc: Document, id: LayerId): Document {
  if (!doc.layers.some((l) => l.id === id)) return doc
  return { ...doc, layers: doc.layers.filter((l) => l.id !== id) }
}

export function duplicateLayer(doc: Document, id: LayerId): Document {
  const index = doc.layers.findIndex((l) => l.id === id)
  if (index === -1) return doc
  const source = doc.layers[index]
  const copy: Layer = structuredClone({ ...source, id: newId(), name: `${source.name} copy` })
  const layers = [...doc.layers]
  layers.splice(index + 1, 0, copy)
  return { ...doc, layers }
}

export function moveLayer(doc: Document, id: LayerId, delta: number): Document {
  const from = doc.layers.findIndex((l) => l.id === id)
  if (from === -1) return doc
  const to = Math.min(doc.layers.length - 1, Math.max(0, from + delta))
  if (to === from) return doc
  const layers = [...doc.layers]
  const [moved] = layers.splice(from, 1)
  layers.splice(to, 0, moved)
  return { ...doc, layers }
}

/**
 * Applies `fn` to the layer with `id`, or returns `doc` unchanged if no
 * layer has that id.
 *
 * `fn` must not mutate its argument -- it must return a new layer (or an
 * unchanged reference to signal no change). Every op built on updateLayer
 * (renameLayer, setLayerVisible, setShapeType, and the field setters below)
 * relies on this convention for its own purity; a mutating `fn` would
 * corrupt the input document that callers still hold a reference to.
 */
export function updateLayer(
  doc: Document,
  id: LayerId,
  fn: (layer: Layer) => Layer,
): Document {
  const index = doc.layers.findIndex((l) => l.id === id)
  if (index === -1) return doc
  const next = fn(doc.layers[index])
  // A callback that guards and returns its input unchanged must not produce a
  // new document: `apply` records an undo entry per new document object, so
  // that would bank a step whose undo visibly does nothing.
  if (next === doc.layers[index]) return doc
  const layers = [...doc.layers]
  layers[index] = next
  return { ...doc, layers }
}

export function renameLayer(doc: Document, id: LayerId, name: string): Document {
  return updateLayer(doc, id, (l) => ({ ...l, name }))
}

export function setLayerVisible(doc: Document, id: LayerId, visible: boolean): Document {
  return updateLayer(doc, id, (l) => ({ ...l, visible }))
}

export function setShapeType(doc: Document, id: LayerId, type: ShapeType): Document {
  return updateLayer(doc, id, (l) => ({ ...l, shape: structuredClone(DEFAULT_SHAPES[type]) }))
}

export function setCanvasSize(doc: Document, width: number, height: number): Document {
  return { ...doc, canvas: { ...doc.canvas, width, height } }
}

export function setShapeField(
  doc: Document,
  id: LayerId,
  key: string,
  value: Field,
): Document {
  return updateLayer(doc, id, (l) => ({
    ...l,
    shape: { ...l.shape, [key]: value } as ShapeConfig,
  }))
}

export function setRepeaterField(
  doc: Document,
  id: LayerId,
  index: number,
  key: string,
  value: Field,
): Document {
  return updateLayer(doc, id, (l) => {
    if (index < 0 || index >= l.repeaters.length) return l
    const repeaters = l.repeaters.map((r, i) => (i === index ? { ...r, [key]: value } : r))
    return { ...l, repeaters }
  })
}

export function addRepeater(doc: Document, id: LayerId, type: RepeaterType): Document {
  return updateLayer(doc, id, (l) => ({
    ...l,
    repeaters: [...l.repeaters, structuredClone(DEFAULT_REPEATERS[type])],
  }))
}

export function removeRepeater(doc: Document, id: LayerId, index: number): Document {
  return updateLayer(doc, id, (l) => {
    // Refusing at one keeps the Repeat section on screen. A layer with no
    // repeaters renders a single instance at the origin -- legal, but the
    // only way back would be undo.
    if (l.repeaters.length <= 1) return l
    if (index < 0 || index >= l.repeaters.length) return l
    return { ...l, repeaters: l.repeaters.filter((_, i) => i !== index) }
  })
}

export function moveRepeater(doc: Document, id: LayerId, index: number, delta: number): Document {
  return updateLayer(doc, id, (l) => {
    const to = index + delta
    if (index < 0 || index >= l.repeaters.length) return l
    if (to < 0 || to >= l.repeaters.length) return l
    // A move of nothing must return the layer itself: splicing an element out
    // and straight back in rebuilds an identical array behind a new reference,
    // which slips past updateLayer's identity guard and banks an undo entry
    // whose undo does nothing visible.
    if (delta === 0) return l
    const repeaters = [...l.repeaters]
    const [moved] = repeaters.splice(index, 1)
    repeaters.splice(to, 0, moved)
    return { ...l, repeaters }
  })
}

export function setRepeaterType(
  doc: Document,
  id: LayerId,
  index: number,
  type: RepeaterType,
): Document {
  return updateLayer(doc, id, (l) => {
    if (index < 0 || index >= l.repeaters.length) return l
    if (l.repeaters[index].type === type) return l
    const repeaters = l.repeaters.map((r, i) =>
      i === index ? structuredClone(DEFAULT_REPEATERS[type]) : r,
    )
    return { ...l, repeaters }
  })
}

export function setFillChannel(
  doc: Document,
  id: LayerId,
  channel: 'l' | 'c' | 'h' | 'a',
  value: Field,
): Document {
  return updateLayer(doc, id, (l) =>
    l.style.fill ? { ...l, style: { ...l.style, fill: { ...l.style.fill, [channel]: value } } } : l,
  )
}

/**
 * Sets the layer's fill, or clears it when given undefined.
 *
 * Clones the incoming colour (structuredClone, as setShapeType does for its
 * defaults) rather than storing the caller's object by reference -- callers
 * routinely pass a shared constant such as DEFAULT_FILL, and storing that
 * reference would let two layers alias the same Colour (and any Modulated
 * field inside it).
 */
export function setFill(doc: Document, id: LayerId, fill: Colour | undefined): Document {
  return updateLayer(doc, id, (l) => {
    if (fill === undefined) {
      const { fill: _drop, ...style } = l.style
      return { ...l, style }
    }
    return { ...l, style: { ...l.style, fill: structuredClone(fill) } }
  })
}

/**
 * Sets the layer's stroke, or clears it when given undefined.
 *
 * Clones the incoming stroke (structuredClone, as setShapeType does for its
 * defaults) for the same reason as setFill -- DEFAULT_STROKE is a module-level
 * constant, and Brief 2's enable-from-scratch path calls this with it (or a
 * stashed value) directly, so storing it by reference would let two freshly
 * enabled strokes alias the same colour object.
 */
export function setStroke(
  doc: Document,
  id: LayerId,
  stroke: { colour: Colour; width: Field } | undefined,
): Document {
  return updateLayer(doc, id, (l) => {
    if (stroke === undefined) {
      const { stroke: _drop, ...style } = l.style
      return { ...l, style }
    }
    return { ...l, style: { ...l.style, stroke: structuredClone(stroke) } }
  })
}

/** Edits one channel of the stroke's colour. No-op when the layer has no stroke. */
export function setStrokeChannel(
  doc: Document,
  id: LayerId,
  channel: 'l' | 'c' | 'h' | 'a',
  value: Field,
): Document {
  return updateLayer(doc, id, (l) =>
    l.style.stroke
      ? {
          ...l,
          style: {
            ...l.style,
            stroke: { ...l.style.stroke, colour: { ...l.style.stroke.colour, [channel]: value } },
          },
        }
      : l,
  )
}

/** Edits the stroke's width. No-op when the layer has no stroke. */
export function setStrokeWidth(doc: Document, id: LayerId, value: Field): Document {
  return updateLayer(doc, id, (l) =>
    l.style.stroke ? { ...l, style: { ...l.style, stroke: { ...l.style.stroke, width: value } } } : l,
  )
}

/**
 * Replaces the whole fill colour. No-op when the layer has no fill.
 *
 * The picker moves several channels at once -- one drag of the plane changes
 * both lightness and chroma -- so it writes through here rather than looping
 * setFillChannel, which would bank a separate undo entry per channel. Clones
 * for the same reason setFill does: callers hand over picker state and shared
 * constants that must not become aliased document contents.
 */
export function setFillColour(doc: Document, id: LayerId, colour: Colour): Document {
  return updateLayer(doc, id, (l) =>
    l.style.fill ? { ...l, style: { ...l.style, fill: structuredClone(colour) } } : l,
  )
}

/** Replaces the whole stroke colour, leaving its width alone. No-op with no stroke. */
export function setStrokeColour(doc: Document, id: LayerId, colour: Colour): Document {
  return updateLayer(doc, id, (l) =>
    l.style.stroke
      ? { ...l, style: { ...l.style, stroke: { ...l.style.stroke, colour: structuredClone(colour) } } }
      : l,
  )
}

/**
 * Replaces the canvas background.
 *
 * buildScene resolves the background against the root context, so a Modulated
 * field here collapses to its base -- the Inspector offers no ramp for it, and
 * this stores whatever it is handed without pretending otherwise.
 */
export function setBackground(doc: Document, colour: Colour): Document {
  return { ...doc, canvas: { ...doc.canvas, background: structuredClone(colour) } }
}
