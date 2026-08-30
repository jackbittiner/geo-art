import type { RepeaterType } from '../geometry/repeaters'
import type { ShapeType } from '../document/schema'

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
}

export const SHAPE_FIELDS: Record<ShapeType, FieldDescriptor[]> = {
  polygon: [
    { key: 'sides', label: 'sides', min: 3, max: 60, step: 1 },
    { key: 'radius', label: 'radius', min: 0, max: 600, unit: 'px' },
    { key: 'rotation', label: 'rotation', min: -360, max: 360, unit: '°' },
  ],
  ellipse: [
    { key: 'rx', label: 'rx', min: 0, max: 600, unit: 'px' },
    { key: 'ry', label: 'ry', min: 0, max: 600, unit: 'px' },
    { key: 'rotation', label: 'rotation', min: -360, max: 360, unit: '°' },
  ],
}

export const REPEATER_FIELDS: Record<RepeaterType, FieldDescriptor[]> = {
  radial: [
    { key: 'count', label: 'count', min: 1, max: 200, step: 1 },
    { key: 'radius', label: 'radius', min: 0, max: 800, unit: 'px' },
    { key: 'startAngle', label: 'start', min: -360, max: 360, unit: '°' },
    { key: 'spin', label: 'spin', min: -360, max: 360, unit: '°' },
  ],
}

export const COLOUR_FIELDS: FieldDescriptor[] = [
  { key: 'l', label: 'lightness', min: 0, max: 1, step: 0.01 },
  { key: 'c', label: 'chroma', min: 0, max: 0.5, step: 0.005 },
  { key: 'h', label: 'hue', min: 0, max: 360, unit: '°' },
  { key: 'a', label: 'alpha', min: 0, max: 1, step: 0.01 },
]
