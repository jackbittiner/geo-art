import type { RepeaterType } from '../geometry/repeaters'
import type { ShapeType } from '../document/schema'

/**
 * Where `to` lands when modulation is switched on. Three forms, because the
 * useful default genuinely differs: an absolute value (alpha ramps to 0), an
 * offset from wherever the user left the base (hue jumps +120, spin a full
 * turn), and "the further bound" for lightness, where the interesting
 * direction depends on where you started. Omitted means the descriptor's max.
 */
export type RampTarget =
  | { kind: 'value'; value: number }
  | { kind: 'offset'; delta: number }
  | { kind: 'far' }

export type FieldDescriptor = {
  key: string
  label: string
  min: number
  max: number
  /**
   * Omitted means 'any' (see FieldRow): a slider that snapped to whole units
   * by default silently destroyed fractional values -- Moiré's startAngle of
   * 4.5 among them. Only descriptors that are genuinely integral (sides,
   * count) declare a step.
   */
  step?: number
  unit?: string
  /** Where `to` lands when modulation is switched on. Defaults to `max`. */
  rampTo?: RampTarget
  /** How the preview strip renders this field's values. Defaults to bars. */
  preview?: 'gradient' | 'bars'
  /** Hue wraps, so 400° is a legal target even though max is 360. */
  wraps?: boolean
  /**
   * Resolved against the child context, so the field varies across copies
   * even with a single repeater. The `~` toggle renders only where this is
   * set: radial's count, radius and startAngle resolve against the *parent*
   * context and would silently do nothing. See spec §4a.
   */
  perCopy?: boolean
}

export const SHAPE_FIELDS: Record<ShapeType, FieldDescriptor[]> = {
  polygon: [
    { key: 'sides', label: 'sides', min: 3, max: 60, step: 1, perCopy: true },
    { key: 'radius', label: 'radius', min: 0, max: 600, unit: 'px', perCopy: true },
    {
      key: 'rotation', label: 'rotation', min: -360, max: 360, unit: '°',
      perCopy: true, rampTo: { kind: 'offset', delta: 360 },
    },
  ],
  ellipse: [
    { key: 'rx', label: 'rx', min: 0, max: 600, unit: 'px', perCopy: true },
    { key: 'ry', label: 'ry', min: 0, max: 600, unit: 'px', perCopy: true },
    {
      key: 'rotation', label: 'rotation', min: -360, max: 360, unit: '°',
      perCopy: true, rampTo: { kind: 'offset', delta: 360 },
    },
  ],
}

export const REPEATER_FIELDS: Record<RepeaterType, FieldDescriptor[]> = {
  radial: [
    // count, radius and startAngle resolve against the parent context, so with
    // a single repeater they cannot vary: no perCopy, no toggle. See spec §4a.
    { key: 'count', label: 'count', min: 1, max: 200, step: 1 },
    { key: 'radius', label: 'radius', min: 0, max: 800, unit: 'px' },
    { key: 'startAngle', label: 'start', min: -360, max: 360, unit: '°' },
    {
      key: 'spin', label: 'spin', min: -360, max: 360, unit: '°',
      perCopy: true, rampTo: { kind: 'offset', delta: 360 },
    },
  ],
}

export const COLOUR_FIELDS: FieldDescriptor[] = [
  {
    key: 'l', label: 'lightness', min: 0, max: 1, step: 0.01,
    perCopy: true, preview: 'gradient', rampTo: { kind: 'far' },
  },
  {
    key: 'c', label: 'chroma', min: 0, max: 0.5, step: 0.005,
    perCopy: true, preview: 'gradient', rampTo: { kind: 'value', value: 0 },
  },
  {
    key: 'h', label: 'hue', min: 0, max: 360, unit: '°',
    perCopy: true, preview: 'gradient', wraps: true, rampTo: { kind: 'offset', delta: 120 },
  },
  {
    key: 'a', label: 'alpha', min: 0, max: 1, step: 0.01,
    perCopy: true, preview: 'gradient', rampTo: { kind: 'value', value: 0 },
  },
]
