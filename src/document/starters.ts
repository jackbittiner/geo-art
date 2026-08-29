import type { Colour, Document, Layer } from './schema'

const PAPER: Colour = { l: 0.97, c: 0.008, h: 90, a: 1 }
const INK: Colour = { l: 0.15, c: 0.02, h: 260, a: 1 }

function layer(id: string, name: string, over: Partial<Layer>): Layer {
  return {
    id,
    name,
    visible: true,
    shape: { type: 'polygon', sides: 6, radius: 60, rotation: 0 },
    repeaters: [{ type: 'radial', count: 12, radius: 180, startAngle: 0, spin: 0 }],
    style: { fill: { l: 0.62, c: 0.18, h: 280, a: 0.35 } },
    blend: 'normal',
    opacity: 1,
    ...over,
  }
}

function doc(background: Colour, layers: Layer[]): Document {
  return {
    version: 1,
    seed: 8814,
    canvas: { width: 1200, height: 1200, background },
    layers,
    maxInstances: 100_000,
  }
}

export const STARTERS: { id: string; name: string; blurb: string; build(): Document }[] = [
  {
    id: 'rose-window',
    name: 'Rose window',
    blurb: 'Two counter-rotated rings of translucent hexagons.',
    build: () =>
      doc(PAPER, [
        layer('rose-outer', 'outer ring', {
          shape: { type: 'polygon', sides: 6, radius: 110, rotation: 0 },
          repeaters: [{ type: 'radial', count: 18, radius: 300, startAngle: 0, spin: 0 }],
          style: { fill: { l: 0.55, c: 0.16, h: 285, a: 0.28 } },
        }),
        layer('rose-inner', 'inner ring', {
          shape: { type: 'polygon', sides: 6, radius: 90, rotation: 30 },
          repeaters: [{ type: 'radial', count: 12, radius: 170, startAngle: 15, spin: 0 }],
          style: { fill: { l: 0.68, c: 0.15, h: 210, a: 0.3 } },
        }),
      ]),
  },
  {
    id: 'aperture',
    name: 'Aperture',
    blurb: 'One ring of ellipses whose spin ramps a full turn — the modulation trick.',
    build: () =>
      doc(INK, [
        layer('aperture-blades', 'blades', {
          shape: { type: 'ellipse', rx: 220, ry: 40, rotation: 0 },
          repeaters: [
            {
              type: 'radial',
              count: 24,
              radius: 120,
              startAngle: 0,
              spin: { base: 0, to: 360, source: 'index', curve: 'linear' },
            },
          ],
          style: { fill: { l: 0.75, c: 0.14, h: 60, a: 0.12 } },
        }),
      ]),
  },
  {
    id: 'moire',
    name: 'Moiré',
    blurb: 'Two offset rings of thin ellipses; the interference does the work.',
    build: () =>
      doc(PAPER, [
        layer('moire-a', 'ring a', {
          shape: { type: 'ellipse', rx: 300, ry: 300, rotation: 0 },
          repeaters: [{ type: 'radial', count: 40, radius: 60, startAngle: 0, spin: 0 }],
          style: { fill: undefined, stroke: { colour: { l: 0.4, c: 0.1, h: 20, a: 0.25 }, width: 1.5 } },
        }),
        layer('moire-b', 'ring b', {
          shape: { type: 'ellipse', rx: 300, ry: 300, rotation: 0 },
          repeaters: [{ type: 'radial', count: 40, radius: 90, startAngle: 4.5, spin: 0 }],
          style: { fill: undefined, stroke: { colour: { l: 0.4, c: 0.12, h: 250, a: 0.25 }, width: 1.5 } },
        }),
      ]),
  },
]
