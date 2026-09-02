import { EASINGS } from '../geometry/easing'
import type { RepeaterConfig } from '../geometry/repeaters'
import { newId } from './defaults'
import type { Colour, Layer, ShapeConfig } from './schema'

/** A source of uniform values in [0, 1) — `Math.random`, or a stub in tests. */
export type Rng = () => number

function float(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min)
}

/** Inclusive of both ends: `rng` never returns 1, so `max` is reachable but never exceeded. */
function int(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

function pick<T>(rng: Rng, options: readonly T[]): T {
  return options[Math.floor(rng() * options.length)]
}

function randomShape(rng: Rng): ShapeConfig {
  if (pick(rng, ['polygon', 'ellipse'] as const) === 'polygon') {
    return {
      type: 'polygon',
      sides: int(rng, 3, 8),
      radius: float(rng, 40, 140),
      rotation: float(rng, 0, 360),
    }
  }
  return {
    type: 'ellipse',
    rx: float(rng, 30, 260),
    ry: float(rng, 30, 260),
    rotation: float(rng, 0, 360),
  }
}

/**
 * Counts stay small (24 radial copies, 36 grid cells) so a roll cannot land
 * anywhere near the document's instance guard.
 */
function randomRepeater(rng: Rng): RepeaterConfig {
  if (pick(rng, ['radial', 'grid'] as const) === 'radial') {
    return {
      type: 'radial',
      count: int(rng, 6, 24),
      radius: float(rng, 80, 320),
      startAngle: float(rng, 0, 360),
      spin: 0,
    }
  }
  return {
    type: 'grid',
    rows: int(rng, 2, 6),
    cols: int(rng, 2, 6),
    spacingX: float(rng, 80, 200),
    spacingY: float(rng, 80, 200),
    spin: 0,
  }
}

/**
 * A layer rolled from bounded ranges — the "Start random" entry point.
 *
 * Ranges are deliberately narrower than the schema allows: the point is a
 * legible starting drawing, not a uniform sample of the configuration space.
 * Roughly half of all rolls modulate exactly one field (a spin sweep or a hue
 * ramp), which is the move that makes this app interesting; `source: 'index'`
 * is used because it is one of the three the Phase 1 engine implements.
 */
export function randomLayer(name: string, rng: Rng = Math.random): Layer {
  const shape = randomShape(rng)
  const repeater = randomRepeater(rng)
  const l = float(rng, 0.5, 0.8)
  const c = float(rng, 0.1, 0.2)
  const hue = float(rng, 0, 360)
  const a = float(rng, 0.2, 0.5)
  const fill: Colour = { l, c, h: hue, a }

  if (rng() < 0.5) {
    if (pick(rng, ['spin', 'hue'] as const) === 'spin') {
      repeater.spin = {
        base: 0,
        to: pick(rng, [-360, -180, 180, 360]),
        source: 'index',
        curve: pick(rng, EASINGS),
      }
    } else {
      fill.h = {
        base: hue,
        to: hue + float(rng, 60, 180),
        source: 'index',
        curve: pick(rng, EASINGS),
      }
    }
  }

  return {
    id: newId(),
    name,
    visible: true,
    shape,
    repeaters: [repeater],
    style: { fill },
    blend: 'normal',
    opacity: 1,
  }
}
