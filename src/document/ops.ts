import { defaultLayer, newId } from './defaults'
import type { Field } from '../geometry/field'
import type { Document, Layer, LayerId, ShapeConfig, ShapeType } from './schema'

const DEFAULT_SHAPES: Record<ShapeType, ShapeConfig> = {
  polygon: { type: 'polygon', sides: 6, radius: 60, rotation: 0 },
  ellipse: { type: 'ellipse', rx: 60, ry: 40, rotation: 0 },
}

export function addLayer(doc: Document, name = 'layer'): Document {
  return { ...doc, layers: [...doc.layers, defaultLayer(name)] }
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
  const layers = [...doc.layers]
  layers[index] = fn(layers[index])
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
