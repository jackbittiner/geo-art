import type { Modulated } from '../geometry/field'
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
