import { z } from 'zod'
import { EASINGS } from '../geometry/easing'
import type { Field } from '../geometry/field'
import type { RepeaterConfig } from '../geometry/repeaters'

export type LayerId = string

export type Colour = { l: Field; c: Field; h: Field; a: Field }

export type StyleConfig = {
  fill?: Colour
  stroke?: { colour: Colour; width: Field }
}

export type ShapeConfig =
  | { type: 'polygon'; sides: Field; radius: Field; rotation: Field }
  | { type: 'ellipse'; rx: Field; ry: Field; rotation: Field }

export type ShapeType = ShapeConfig['type']

/** Only 'normal' is honoured in Phase 1; the rest land in Phase 3. */
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'difference'

export type Layer = {
  id: LayerId
  name: string
  visible: boolean
  shape: ShapeConfig
  repeaters: RepeaterConfig[]
  style: StyleConfig
  blend: BlendMode
  opacity: number
}

export type Document = {
  version: 1
  seed: number
  canvas: { width: number; height: number; background: Colour }
  layers: Layer[]
  maxInstances: number
}

// --- zod ---

const modulatedSchema = z.object({
  base: z.number(),
  to: z.number(),
  // Only the three sources the engine implements (see geometry/field.ts,
  // which throws on the rest). Accepting 'depth' | 'radius' | 'angle' here
  // turned a bad file into a render-time crash that blanked the page; no
  // document in the wild can contain them, so narrowing is a no-op migration
  // that converts that crash into a clear load-time rejection. Phase 2 widens
  // this as the engine gains support.
  source: z.enum(['index', 't', 'flatIndex']),
  level: z.number().int().min(0).optional(),
  curve: z.enum(EASINGS),
  cycles: z.number().positive().optional(),
})

const fieldSchema = z.union([z.number(), modulatedSchema])

/**
 * A Field constrained to a range when it is a plain number. The bound applies
 * only to the literal branch — a Modulated field (e.g. { base: 999, to: -50 })
 * is not range-checked here, since the renderer clamps its resolved value
 * regardless. Do not read this as a guarantee that a Modulated field's base/to
 * stay in range.
 */
const boundedField = (min: number, max: number) =>
  z.union([z.number().min(min).max(max), modulatedSchema])

const colourSchema = z.object({
  l: boundedField(0, 1),
  c: boundedField(0, 0.5),
  // Hue is deliberately unbounded: degrees wrap, so there is no invalid range.
  h: fieldSchema,
  a: boundedField(0, 1),
})

const shapeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('polygon'),
    sides: fieldSchema,
    radius: fieldSchema,
    rotation: fieldSchema,
  }),
  z.object({
    type: z.literal('ellipse'),
    rx: fieldSchema,
    ry: fieldSchema,
    rotation: fieldSchema,
  }),
])

const repeaterSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('radial'),
    count: fieldSchema,
    radius: fieldSchema,
    startAngle: fieldSchema,
    spin: fieldSchema,
  }),
  z.object({
    type: z.literal('grid'),
    rows: fieldSchema,
    cols: fieldSchema,
    spacingX: fieldSchema,
    spacingY: fieldSchema,
    spin: fieldSchema,
  }),
])

const styleSchema = z.object({
  fill: colourSchema.optional(),
  stroke: z.object({ colour: colourSchema, width: fieldSchema }).optional(),
})

export const layerSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  visible: z.boolean(),
  shape: shapeSchema,
  repeaters: z.array(repeaterSchema),
  style: styleSchema,
  blend: z.enum(['normal', 'multiply', 'screen', 'overlay', 'difference']),
  opacity: z.number().min(0).max(1),
})

export const documentSchema = z.object({
  version: z.literal(1),
  seed: z.number().int(),
  canvas: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    background: colourSchema,
  }),
  layers: z.array(layerSchema),
  maxInstances: z.number().int().positive(),
})
