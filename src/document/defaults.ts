import type { Colour, Document, Layer } from './schema'

export function newId(): string {
  return crypto.randomUUID()
}

export const WHITE_BACKGROUND: Colour = { l: 0.98, c: 0.005, h: 250, a: 1 }

export function emptyDocument(): Document {
  return {
    version: 1,
    seed: 8814,
    canvas: { width: 1200, height: 1200, background: { ...WHITE_BACKGROUND } },
    layers: [],
    maxInstances: 100_000,
  }
}

export function defaultLayer(name: string): Layer {
  return {
    id: newId(),
    name,
    visible: true,
    shape: { type: 'polygon', sides: 6, radius: 60, rotation: 0 },
    repeaters: [{ type: 'radial', count: 12, radius: 180, startAngle: 0, spin: 0 }],
    style: { fill: { l: 0.62, c: 0.18, h: 280, a: 0.35 } },
    blend: 'normal',
    opacity: 1,
  }
}
