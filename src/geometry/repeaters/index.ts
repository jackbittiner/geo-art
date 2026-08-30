import { grid } from './grid'
import { radial } from './radial'
import type { Repeater, RepeaterConfig, RepeaterType } from './types'

const REGISTRY: Record<RepeaterType, Repeater<never>> = {
  radial: radial as Repeater<never>,
  grid: grid as Repeater<never>,
}

export function getRepeater(type: RepeaterType): Repeater<RepeaterConfig> {
  const found = REGISTRY[type]
  if (!found) throw new Error(`Unknown repeater type: ${type}`)
  return found as Repeater<RepeaterConfig>
}

export { grid, radial }
export type {
  Placement, Repeater, RepeaterConfig, RepeaterType, RadialConfig, GridConfig,
} from './types'
