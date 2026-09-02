import type { EvalContext } from '../geometry/context'
import type { Colour } from '../document/schema'
import type { Modulated } from '../geometry/field'
import { resolve } from '../geometry/field'
import type { ResolvedColour } from '../geometry/instance'
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
  return previewIndices(count).map(({ index, total }) => resolve(field, previewContext(index, total)))
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

/**
 * The whole colours the first `count` copies will actually receive.
 *
 * Resolves all four channels against one shared context per copy, which is
 * what makes the two-chip strip honest: a per-channel preview can only show
 * one channel sweeping while it invents plausible values for the other three
 * (the Inspector used to do exactly that). Calls the engine's `resolve` for
 * the same reason `previewValues` does, and is pinned by the same anti-drift
 * test.
 */
export function previewColours(colour: Colour, count: number): ResolvedColour[] {
  return previewIndices(count).map(({ index, total }) => {
    const ctx = previewContext(index, total)
    return {
      l: resolve(colour.l, ctx),
      c: resolve(colour.c, ctx),
      h: resolve(colour.h, ctx),
      a: resolve(colour.a, ctx),
    }
  })
}

/**
 * The copies a strip samples: every one of them below PREVIEW_CELLS, and
 * beyond that an even spread of true indices against the true total.
 *
 * Shared by both previews so they can never disagree about which copies they
 * are describing. Renumbering the cells 0..23 instead would normalise `t`
 * against the wrong denominator and collapse a multi-cycle ramp into one.
 */
function previewIndices(count: number): { index: number; total: number }[] {
  const total = Math.max(0, Math.round(count))
  if (total === 0) return []
  const cells = Math.min(total, PREVIEW_CELLS)
  return Array.from({ length: cells }, (_, k) => ({
    index: cells === 1 ? 0 : Math.round((k * (total - 1)) / (cells - 1)),
    total,
  }))
}
