import type { Path } from './path'
import type { Mat2D } from './transform'

export type ResolvedColour = { l: number; c: number; h: number; a: number }

export type ResolvedStyle = {
  fill?: ResolvedColour
  stroke?: { colour: ResolvedColour; width: number }
}

export type Instance = {
  path: Path
  transform: Mat2D
  style: ResolvedStyle
}

export type EvaluationResult = {
  layers: { layerId: string; instances: Instance[] }[]
  totalInstances: number
  truncated: boolean
  perLayerCounts: Record<string, number>
  /**
   * Cumulative instance count after each link of each layer's chain. The
   * inspector shows a link's own contribution against the running product,
   * which is what tells you *which* link blew the budget when a chain
   * truncates.
   */
  perLayerLevelCounts: Record<string, number[]>
  /**
   * Whether each link's expansion was cut short by the instance budget. One
   * entry per link, aligned with `perLayerLevelCounts`.
   *
   * The chain-wide `truncated` flag cannot answer this: a cumulative count is
   * only the product of the counts above it when every level up to and
   * including it ran to completion, and a level cut off at a round budget
   * (100_000 is round) still divides its parent exactly -- so the arithmetic
   * alone cannot tell a real factorisation from an invented one.
   */
  perLayerLevelTruncated: Record<string, boolean[]>
  /**
   * Whether every parent copy at each link contributed the same number of
   * children. One entry per link, aligned with `perLayerLevelCounts`.
   *
   * Dividing a cumulative count by the one above it only recovers a link's own
   * contribution when that link expanded every parent identically, and a link's
   * `count` (or `rows`/`cols`) is a Field resolved against the *parent*
   * context, so it need not: [radial(2), radial(count 2 -> 4)] makes 2 children
   * under one parent and 4 under the other with nothing truncated, and the
   * cumulative 6 divides its parent 2 exactly while no link in that document
   * produces 3.
   */
  perLayerLevelUniform: Record<string, boolean[]>
}
