import type { EvalContext } from '../context'
import { resolve } from '../field'
import { compose, degToRad, rotate, translate } from '../transform'
import type { GridConfig, Placement, Repeater } from './types'

export const grid: Repeater<GridConfig> = {
  type: 'grid',

  expand(config: GridConfig, parent: EvalContext, limit: number): Placement[] {
    const rows = Math.max(1, Math.round(resolve(config.rows, parent)))
    const cols = Math.max(1, Math.round(resolve(config.cols, parent)))
    const spacingX = resolve(config.spacingX, parent)
    const spacingY = resolve(config.spacingY, parent)
    const count = rows * cols
    // Emit at most `limit` cells, but every child still carries the *full*
    // intended count (via ctx.counts and the t normalisation below) — a
    // truncated grid is the first N cells of the intended grid, correctly
    // positioned, not N cells of a smaller re-centred one.
    const emit = Math.min(count, Math.max(0, limit))

    // Centred on the parent origin. A grid dropped inside a radial then
    // surrounds each ring copy rather than hanging off to one side, which is
    // what makes the two compose into anything worth looking at.
    const originX = -((cols - 1) / 2) * spacingX
    const originY = -((rows - 1) / 2) * spacingY

    const placements: Placement[] = []
    for (let i = 0; i < emit; i++) {
      const row = Math.floor(i / cols)
      const col = i % cols
      const ctx: EvalContext = {
        ...parent,
        indices: [...parent.indices, i],
        counts: [...parent.counts, count],
        // The flat position, not the position within the row: a spin ramp
        // should sweep the whole grid rather than restart every row.
        t: count <= 1 ? 0 : i / (count - 1),
      }
      const spin = degToRad(resolve(config.spin, ctx))
      placements.push({
        transform: compose(
          translate(originX + col * spacingX, originY + row * spacingY),
          rotate(spin),
        ),
        ctx,
      })
    }
    return placements
  },
}
