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
}
