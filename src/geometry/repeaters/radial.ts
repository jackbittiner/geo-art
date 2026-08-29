import type { EvalContext } from '../context'
import { isModulated, resolve, type Field } from '../field'
import { compose, degToRad, rotate, translate } from '../transform'
import type { Placement, RadialConfig, Repeater } from './types'

function upperBound(field: Field): number {
  return isModulated(field) ? Math.max(field.base, field.to) : field
}

export const radial: Repeater<RadialConfig> = {
  type: 'radial',

  expand(config: RadialConfig, parent: EvalContext): Placement[] {
    const count = Math.max(1, Math.round(resolve(config.count, parent)))
    const radius = resolve(config.radius, parent)
    const startAngle = degToRad(resolve(config.startAngle, parent))

    const placements: Placement[] = []
    for (let i = 0; i < count; i++) {
      const ctx: EvalContext = {
        ...parent,
        indices: [...parent.indices, i],
        counts: [...parent.counts, count],
        t: count <= 1 ? 0 : i / (count - 1),
      }
      const theta = startAngle + (i * 2 * Math.PI) / count
      const spin = degToRad(resolve(config.spin, ctx))
      placements.push({
        transform: compose(
          translate(radius * Math.cos(theta), radius * Math.sin(theta)),
          rotate(spin),
        ),
        ctx,
      })
    }
    return placements
  },

  estimate(config: RadialConfig): number {
    return Math.max(1, Math.round(upperBound(config.count)))
  },
}
