import type { EvalContext } from '../context'
import type { Field } from '../field'
import type { Mat2D } from '../transform'

export type Placement = {
  transform: Mat2D
  /** The child context, built by the repeater. */
  ctx: EvalContext
}

export interface Repeater<C> {
  type: string
  expand(config: C, parent: EvalContext): Placement[]
  /** Cheap upper bound on copy count, for the explosion guard. */
  estimate(config: C): number
}

export type RadialConfig = {
  type: 'radial'
  count: Field
  /** Distance of each copy from the layer origin. */
  radius: Field
  /** Degrees. Angle of the first copy. */
  startAngle: Field
  /** Degrees. Rotation of each copy about its own centre. */
  spin: Field
}

/** Grows in Phase 2 with grid, path, recursive, mirror, symmetry, kaleido. */
export type RepeaterConfig = RadialConfig
export type RepeaterType = RepeaterConfig['type']
