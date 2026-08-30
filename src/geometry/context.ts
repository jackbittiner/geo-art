export type EvalContext = {
  /** Index at each level of the repeater chain, outermost first. */
  indices: number[]
  /** Copy count at each level of the repeater chain. */
  counts: number[]
  /** Recursion depth (always 0 until the recursive repeater lands in Phase 2). */
  depth: number
  /** Normalised position within the innermost repeater, 0..1. */
  t: number
  /** Index across every instance the layer produces. */
  flatIndex: number
  /** Total instances the layer produces. */
  total: number
}

export function rootContext(): EvalContext {
  return { indices: [], counts: [], depth: 0, t: 0, flatIndex: 0, total: 1 }
}
