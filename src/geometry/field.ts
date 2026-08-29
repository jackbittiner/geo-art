import { ease, type Easing } from './easing'
import type { EvalContext } from './context'

export type ModulationSource = 'index' | 't' | 'flatIndex' | 'depth' | 'radius' | 'angle'

export type Modulated = {
  base: number
  to: number
  source: ModulationSource
  /** Which link of the repeater chain drives it. Defaults to the innermost. */
  level?: number
  curve: Easing
  cycles?: number
}

export type Field = number | Modulated

export function isModulated(field: Field): field is Modulated {
  return typeof field !== 'number'
}

function sourceValue(field: Modulated, ctx: EvalContext): number {
  switch (field.source) {
    case 't':
      return ctx.t
    case 'flatIndex':
      return ctx.total <= 1 ? 0 : ctx.flatIndex / (ctx.total - 1)
    case 'index': {
      const level = field.level ?? ctx.indices.length - 1
      if (level < 0 || level >= ctx.indices.length) return 0
      const count = ctx.counts[level]
      return count <= 1 ? 0 : ctx.indices[level] / (count - 1)
    }
    default:
      throw new Error(`Modulation source "${field.source}" is not supported in Phase 1`)
  }
}

export function resolve(field: Field, ctx: EvalContext): number {
  if (typeof field === 'number') return field
  const u = sourceValue(field, ctx)
  const cycles = field.cycles ?? 1
  const cycled = cycles > 1 && u < 1 ? (u * cycles) % 1 : u
  return field.base + (field.to - field.base) * ease(field.curve, cycled)
}
