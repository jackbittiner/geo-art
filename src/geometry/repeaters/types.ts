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
  /**
   * Expands one node into its children, emitting at most `limit` placements
   * even when the resolved copy count is larger. `limit` is required so the
   * explosion guard cannot be bypassed by a repeater that forgets to honour
   * it: this is the only truncation mechanism, not a fallback alongside a
   * separate size estimate.
   */
  expand(config: C, parent: EvalContext, limit: number): Placement[]
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
