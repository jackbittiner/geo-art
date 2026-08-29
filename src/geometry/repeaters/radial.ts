import type { EvalContext } from '../context'
import { resolve } from '../field'
import { compose, degToRad, rotate, translate } from '../transform'
import type { Placement, RadialConfig, Repeater } from './types'

export const radial: Repeater<RadialConfig> = {
  type: 'radial',

  expand(config: RadialConfig, parent: EvalContext, limit: number): Placement[] {
    const count = Math.max(1, Math.round(resolve(config.count, parent)))
    const radius = resolve(config.radius, parent)
    const startAngle = degToRad(resolve(config.startAngle, parent))
    // Emit at most `limit` copies, but every child still carries the *full*
    // intended `count` (via ctx.counts and the t normalisation below) — a
    // truncated ring is the first N copies of the intended ring, correctly
    // positioned and modulated, not N copies of a redistributed smaller ring.
    const emit = Math.min(count, Math.max(0, limit))

    const placements: Placement[] = []
    for (let i = 0; i < emit; i++) {
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
}
