import type { EvalContext } from '../geometry/context'
import type { Modulated } from '../geometry/field'
import { resolve } from '../geometry/field'
import type { FieldDescriptor } from './descriptors'

/**
 * Where `to` lands when modulation is switched on. Something visible has to
 * happen — a ramp that opens flat teaches nothing — and this is safe because
 * toggling back off restores `base` exactly.
 */
export function toModulated(descriptor: FieldDescriptor, base: number): Modulated {
  return { base, to: rampTarget(descriptor, base), source: 'index', curve: 'linear' }
}

function rampTarget(descriptor: FieldDescriptor, base: number): number {
  const target = descriptor.rampTo ?? { kind: 'value' as const, value: descriptor.max }
  switch (target.kind) {
    case 'value':
      return target.value
    case 'offset':
      return base + target.delta
    case 'far':
      // Whichever bound is further away, so the sweep is always visible.
      return base - descriptor.min > descriptor.max - base ? descriptor.min : descriptor.max
  }
}

/**
 * Where a field is resolved, which is what a `flatIndex` ramp on it sweeps.
 *
 * A repeater's own fields are resolved during expansion, where `flatIndex` and
 * `total` are still the root context's 0 and 1 -- expandChain never assigns
 * them, and evaluate fills them in afterwards, per instance. So a repeater
 * field sourced on flatIndex is constant at `base` for every copy. Shape,
 * colour and stroke fields are resolved against that instance context and do
 * sweep the whole layer.
 */
export type FieldResolution = 'expansion' | 'instance'

/**
 * Why a preview's denominator is not the count the engine normalised against.
 * Undefined where the two agree.
 *
 * 'truncated': the instance budget cut the link short, so the strip is spread
 * over the copies that survived rather than the copies the repeater intended.
 * 'uneven': the link's parents each asked for a different number of copies, so
 * there is no single per-parent count to spread anything over.
 */
export type PreviewCaveat = 'truncated' | 'uneven'

/** The strip is ~150px wide; more cells than this render as slivers. */
export const PREVIEW_CELLS = 24

/**
 * The values the first `count` copies will actually receive.
 *
 * Calls the engine's own `resolve()` rather than reimplementing the ramp: a
 * preview that drifts from the engine is worse than no preview, because it
 * lies with confidence. Pinned by the anti-drift test.
 */
export function previewValues(field: Modulated, count: number): number[] {
  const total = Math.max(0, Math.round(count))
  if (total === 0) return []
  const cells = Math.min(total, PREVIEW_CELLS)
  return Array.from({ length: cells }, (_, k) => {
    // Sample at the true index against the true total. Renumbering the cells
    // 0..23 would normalise `t` against the wrong denominator and collapse a
    // multi-cycle ramp into one cycle.
    const i = cells === 1 ? 0 : Math.round((k * (total - 1)) / (cells - 1))
    return resolve(field, previewContext(i, total))
  })
}

function previewContext(i: number, total: number): EvalContext {
  return {
    indices: [i],
    counts: [total],
    depth: 0,
    t: total <= 1 ? 0 : i / (total - 1),
    flatIndex: i,
    total,
  }
}
