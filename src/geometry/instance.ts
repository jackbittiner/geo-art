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
}
