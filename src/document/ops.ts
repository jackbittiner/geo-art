import { defaultLayer, newId } from './defaults'
import type { Document, Layer, LayerId, ShapeConfig, ShapeType } from './schema'

const DEFAULT_SHAPES: Record<ShapeType, ShapeConfig> = {
  polygon: { type: 'polygon', sides: 6, radius: 60, rotation: 0 },
  ellipse: { type: 'ellipse', rx: 60, ry: 40, rotation: 0 },
}

export function addLayer(doc: Document, name = 'layer'): Document {
  return { ...doc, layers: [...doc.layers, defaultLayer(name)] }
}

export function removeLayer(doc: Document, id: LayerId): Document {
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
