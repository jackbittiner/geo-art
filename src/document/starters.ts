import type { Colour, Document, Layer } from './schema'

const PAPER: Colour = { l: 0.97, c: 0.008, h: 90, a: 1 }
const INK: Colour = { l: 0.15, c: 0.02, h: 260, a: 1 }
const SLATE: Colour = { l: 0.22, c: 0.03, h: 250, a: 1 }
const DUSK: Colour = { l: 0.28, c: 0.05, h: 30, a: 1 }
const BONE: Colour = { l: 0.93, c: 0.015, h: 70, a: 1 }

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
  {
    id: 'cathedral',
    name: 'Cathedral',
    blurb: 'A ring of rings. The outer link picks the hue, the inner one the spin.',
    build: () =>
      doc(BONE, [
        layer('cathedral-tracery', 'tracery', {
          shape: { type: 'polygon', sides: 5, radius: 30, rotation: 0 },
          repeaters: [
            { type: 'radial', count: 12, radius: 322, startAngle: 0, spin: 0 },
            {
              type: 'radial',
              count: 6,
              radius: 60,
              startAngle: 0,
              // 300, not 360: the ramp is index/(count - 1), so a full turn would
              // put the sixth petal back on the first's orientation.
              spin: { base: 0, to: 300, source: 'index', level: 1, curve: 'linear' },
            },
          ],
          style: {
            fill: {
              l: 0.6,
              c: 0.15,
              // level 0 is the outer ring: every rosette gets one hue, so the
              // twelve of them sweep the wheel while their own six petals stay
              // together. Without the level this would read as noise.
              h: { base: 200, to: 330, source: 'index', level: 0, curve: 'linear' },
              a: 0.35,
            },
          },
        }),
        layer('cathedral-rim', 'rim', {
          shape: { type: 'ellipse', rx: 7, ry: 26, rotation: 0 },
          repeaters: [{ type: 'radial', count: 60, radius: 470, startAngle: 0, spin: 0 }],
          style: {
            fill: undefined,
            stroke: {
              colour: { l: 0.3, c: 0.05, h: 265, a: 0.55 },
              // cycles turns one ramp into six, so the rim beats thick-thin
              // six times around rather than once.
              width: { base: 0.5, to: 3.5, source: 'index', curve: 'sine', cycles: 6 },
            },
          },
        }),
        layer('cathedral-boss', 'boss', {
          shape: { type: 'polygon', sides: 6, radius: 48, rotation: 0 },
          repeaters: [
            {
              type: 'radial',
              count: 8,
              radius: 82,
              startAngle: 0,
              spin: { base: 0, to: 315, source: 'index', curve: 'linear' },
            },
          ],
          style: { fill: { l: 0.66, c: 0.13, h: 265, a: 0.3 } },
        }),
      ]),
  },
  {
    id: 'quilt',
    name: 'Quilt',
    blurb: 'A grid of pinwheels, tinted across the whole field by flatIndex.',
    build: () =>
      doc(BONE, [
        layer('quilt-blocks', 'blocks', {
          shape: { type: 'polygon', sides: 4, radius: 32, rotation: 0 },
          repeaters: [
            { type: 'grid', rows: 7, cols: 7, spacingX: 152, spacingY: 152, spin: 0 },
            {
              type: 'radial',
              count: 4,
              radius: 48,
              startAngle: 0,
              // t is the innermost repeater's own 0..1 position, so each
              // pinwheel spins through a quarter turn independently.
              spin: { base: 0, to: 67.5, source: 't', curve: 'linear' },
            },
          ],
          style: {
            fill: {
              // flatIndex runs across every instance the layer makes, chain and
              // all, so the wash crosses block boundaries instead of resetting.
              l: { base: 0.38, to: 0.86, source: 'flatIndex', curve: 'easeInOut' },
              c: 0.13,
              h: { base: 35, to: 205, source: 'flatIndex', curve: 'linear' },
              a: 0.6,
            },
          },
        }),
        layer('quilt-seams', 'seams', {
          shape: { type: 'ellipse', rx: 9, ry: 9, rotation: 0 },
          repeaters: [{ type: 'grid', rows: 8, cols: 8, spacingX: 152, spacingY: 152, spin: 0 }],
          style: {
            fill: undefined,
            stroke: { colour: { l: 0.35, c: 0.04, h: 60, a: 0.6 }, width: 2 },
          },
        }),
      ]),
  },
  {
    id: 'vortex',
    name: 'Vortex',
    blurb: 'Grids nested inside a ring, each one opening wider than the last.',
    build: () =>
      doc(SLATE, [
        layer('vortex-cells', 'cells', {
          shape: {
            type: 'ellipse',
            // The two radii ramp in opposite directions off the same index, so
            // a cell starts wide and ends tall as the eye crosses its grid.
            rx: { base: 24, to: 6, source: 'index', level: 1, curve: 'linear' },
            ry: { base: 6, to: 24, source: 'index', level: 1, curve: 'linear' },
            rotation: 0,
          },
          repeaters: [
            {
              type: 'radial',
              count: 12,
              radius: 285,
              startAngle: 0,
              // Starting at 18 rather than 0 keeps any one arm from landing
              // axis-aligned, where its grid reads as a block rather than a swirl.
              spin: { base: 18, to: 348, source: 'index', level: 0, curve: 'linear' },
            },
            {
              type: 'grid',
              rows: 4,
              cols: 4,
              // A repeater's own parameters resolve against its *parent*, so
              // level 0 (which arm of the ring) is what widens each grid. The
              // spacing is uniform within a grid and different between them.
              spacingX: { base: 52, to: 76, source: 'index', level: 0, curve: 'easeOut' },
              spacingY: { base: 52, to: 76, source: 'index', level: 0, curve: 'easeOut' },
              spin: 0,
            },
          ],
          style: {
            fill: {
              l: { base: 0.6, to: 0.88, source: 'index', level: 0, curve: 'linear' },
              c: 0.16,
              h: { base: 20, to: 150, source: 'index', level: 0, curve: 'linear' },
              a: 0.8,
            },
          },
        }),
      ]),
  },
  {
    id: 'chrysalis',
    name: 'Chrysalis',
    blurb: 'One ring, but the shape itself morphs: three sides to twelve.',
    build: () =>
      doc(INK, [
        layer('chrysalis-shells', 'shells', {
          shape: {
            // Geometry is modulated here, not just placement — sides, size and
            // rotation all ramp, so no two copies are the same polygon.
            sides: { base: 3, to: 12, source: 'index', curve: 'easeInOut' },
            radius: { base: 25, to: 105, source: 'index', curve: 'easeIn' },
            rotation: { base: 0, to: 180, source: 'index', curve: 'linear' },
            type: 'polygon',
          },
          repeaters: [{ type: 'radial', count: 36, radius: 210, startAngle: 0, spin: 0 }],
          style: {
            fill: {
              l: { base: 0.88, to: 0.42, source: 'index', curve: 'easeOut' },
              c: { base: 0.04, to: 0.2, source: 'index', curve: 'linear' },
              h: { base: 65, to: 300, source: 'index', curve: 'linear' },
              a: { base: 0.5, to: 0.16, source: 'index', curve: 'linear' },
            },
          },
        }),
        layer('chrysalis-thread', 'thread', {
          shape: { type: 'ellipse', rx: 120, ry: 6, rotation: 0 },
          repeaters: [
            {
              type: 'radial',
              count: 36,
              radius: 210,
              startAngle: 5,
              spin: { base: 0, to: 175, source: 'index', curve: 'linear' },
            },
          ],
          style: {
            fill: undefined,
            stroke: { colour: { l: 0.8, c: 0.09, h: 90, a: 0.3 }, width: 1 },
          },
        }),
      ]),
  },
  {
    id: 'reliquary',
    name: 'Reliquary',
    blurb: 'Three links deep. Each one drives a different property by level.',
    build: () =>
      doc(SLATE, [
        layer('reliquary-cases', 'cases', {
          shape: { type: 'polygon', sides: 6, radius: 18, rotation: 0 },
          repeaters: [
            { type: 'radial', count: 6, radius: 300, startAngle: 0, spin: 0 },
            { type: 'radial', count: 5, radius: 118, startAngle: 0, spin: 0 },
            {
              type: 'grid',
              rows: 2,
              cols: 2,
              // Driven by level 1 — which of the four clusters on this arm —
              // because a grid's spacing resolves against its parent.
              spacingX: { base: 26, to: 58, source: 'index', level: 1, curve: 'linear' },
              spacingY: { base: 26, to: 58, source: 'index', level: 1, curve: 'linear' },
              spin: { base: 0, to: 45, source: 'index', level: 2, curve: 'linear' },
            },
          ],
          style: {
            fill: {
              l: 0.76,
              c: 0.16,
              // Level 0 tints the arm, level 2 fades the individual cell: one
              // property per link of the chain, which is what `level` is for.
              h: { base: 250, to: 40, source: 'index', level: 0, curve: 'linear' },
              a: { base: 0.85, to: 0.4, source: 'index', level: 2, curve: 'linear' },
            },
          },
        }),
        layer('reliquary-halo', 'halo', {
          shape: { type: 'ellipse', rx: 300, ry: 300, rotation: 0 },
          repeaters: [{ type: 'radial', count: 6, radius: 300, startAngle: 0, spin: 0 }],
          style: {
            fill: undefined,
            stroke: { colour: { l: 0.62, c: 0.08, h: 250, a: 0.45 }, width: 1.5 },
          },
        }),
      ]),
  },
  {
    id: 'ember',
    name: 'Ember',
    blurb: 'A logarithmic spiral: exp easing on the radius, sine on the halo.',
    build: () =>
      doc(DUSK, [
        layer('ember-halo', 'halo', {
          shape: { type: 'ellipse', rx: 5, ry: 34, rotation: 0 },
          repeaters: [{ type: 'radial', count: 90, radius: 470, startAngle: 0, spin: 0 }],
          style: {
            fill: {
              l: 0.85,
              c: 0.11,
              h: 60,
              // sine over three cycles: the halo breathes in and out of the
              // background three times instead of fading once.
              a: { base: 0.05, to: 0.4, source: 'index', curve: 'sine', cycles: 3 },
            },
          },
        }),
        layer('ember-spiral', 'spiral', {
          shape: {
            type: 'polygon',
            sides: 6,
            radius: { base: 6, to: 46, source: 'index', level: 0, curve: 'easeIn' },
            rotation: 0,
          },
          // A ring of radius 0 is a ring of angles: the first link only rotates,
          // and the second — one copy, pushed out along the rotated x axis by an
          // exp-eased radius — turns those angles into a spiral arm.
          repeaters: [
            {
              type: 'radial',
              count: 64,
              radius: 0,
              startAngle: 0,
              spin: { base: 0, to: 1080, source: 'index', level: 0, curve: 'linear' },
            },
            {
              type: 'radial',
              count: 1,
              radius: { base: 30, to: 500, source: 'index', level: 0, curve: 'exp' },
              startAngle: 0,
              spin: 0,
            },
          ],
          style: {
            fill: {
              l: { base: 0.95, to: 0.55, source: 'index', level: 0, curve: 'linear' },
              c: { base: 0.06, to: 0.19, source: 'index', level: 0, curve: 'linear' },
              h: { base: 95, to: 25, source: 'index', level: 0, curve: 'linear' },
              a: 0.85,
            },
          },
        }),
        layer('ember-counter', 'counter arm', {
          shape: {
            type: 'polygon',
            sides: 6,
            radius: { base: 4, to: 30, source: 'index', level: 0, curve: 'easeIn' },
            rotation: 30,
          },
          // The same spiral, started half a turn along: two arms balance a form
          // that is lopsided on its own.
          repeaters: [
            {
              type: 'radial',
              count: 64,
              radius: 0,
              startAngle: 0,
              spin: { base: 180, to: 1260, source: 'index', level: 0, curve: 'linear' },
            },
            {
              type: 'radial',
              count: 1,
              radius: { base: 30, to: 500, source: 'index', level: 0, curve: 'exp' },
              startAngle: 0,
              spin: 0,
            },
          ],
          style: {
            fill: undefined,
            stroke: {
              colour: { l: 0.9, c: 0.1, h: 70, a: 0.55 },
              width: { base: 0.75, to: 2.5, source: 'index', level: 0, curve: 'linear' },
            },
          },
        }),
      ]),
  },
]
