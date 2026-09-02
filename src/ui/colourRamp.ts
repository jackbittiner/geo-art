import type { Colour } from '../document/schema'
import type { ResolvedColour } from '../geometry/instance'
import { isModulated, type Field } from '../geometry/field'

/**
 * The two-chip view of a Colour: "from" is what the first copy gets, "to" is
 * what the last one gets.
 *
 * A Colour is four independent Fields, each of which may or may not carry a
 * ramp with its own curve, source and cycle count. Two chips cannot express
 * all of that, so this module holds the exact rule for reading and writing
 * them -- chosen so the chips are always *truthful* about a document, even one
 * built entirely through the per-channel rows, and so writing through a chip
 * only ever moves an endpoint and never discards a curve.
 */

export type Endpoint = 'from' | 'to'

const CHANNELS = ['l', 'c', 'h', 'a'] as const
type Channel = (typeof CHANNELS)[number]

const base = (field: Field): number => (isModulated(field) ? field.base : field)
const target = (field: Field): number => (isModulated(field) ? field.to : field)

/** The colour one end of the sweep actually resolves to. */
export function endpointColour(colour: Colour, endpoint: Endpoint): ResolvedColour {
  const read = endpoint === 'from' ? base : target
  return { l: read(colour.l), c: read(colour.c), h: read(colour.h), a: read(colour.a) }
}

/** True when any channel carries a ramp, which is what lights the ramp toggle. */
export function isRamped(colour: Colour): boolean {
  return CHANNELS.some((channel) => isModulated(colour[channel]))
}

/**
 * Hue wraps, so a target of 40 against a base of 280 can mean a 240 degree
 * sweep backwards or a 120 degree one forwards. The engine lerps base to `to`
 * literally, so the choice is ours: take the short way round, since the user
 * dragged the chip to a nearby colour rather than asking for a tour. The
 * result may sit outside 0..360 -- that is exactly what `wraps` on the hue
 * descriptor already allows, and the renderer wraps it at draw time.
 */
function shortestHue(from: number, to: number): number {
  const delta = ((((to - from) % 360) + 540) % 360) - 180
  return from + delta
}

/**
 * Writes one endpoint back into the Colour.
 *
 * Writing "from" moves each channel's base and touches nothing else. Writing
 * "to" moves each modulated channel's target, preserving its curve, source and
 * cycles; a channel that is still flat is promoted to a ramp only if the new
 * target actually differs from its base, so nudging one channel does not
 * silently ramp the other three -- and dragging the "to" chip back onto "from"
 * leaves nothing behind.
 */
export function writeEndpoint(colour: Colour, endpoint: Endpoint, next: ResolvedColour): Colour {
  const write = (channel: Channel): Field => {
    const field = colour[channel]
    const value = next[channel]

    if (endpoint === 'from') {
      return isModulated(field) ? { ...field, base: value } : value
    }

    const to = channel === 'h' ? shortestHue(base(field), value) : value
    if (isModulated(field)) return { ...field, to }
    return to === field ? field : { base: field, to, source: 'index', curve: 'linear' }
  }

  return { l: write('l'), c: write('c'), h: write('h'), a: write('a') }
}

/**
 * Turns the whole colour's ramp on or off.
 *
 * Off collapses every channel to its base, exactly as the per-channel `~`
 * toggle does. On seeds a hue sweep and leaves the other three channels alone:
 * seeding all four from their descriptors would ramp chroma and alpha to zero
 * at once, fading the layer towards invisible grey in a single click, which is
 * not what "show me a gradient" means.
 */
export function setRamped(colour: Colour, ramped: boolean): Colour {
  if (!ramped) {
    return { l: base(colour.l), c: base(colour.c), h: base(colour.h), a: base(colour.a) }
  }
  if (isRamped(colour)) return colour
  const hue = base(colour.h)
  return { ...colour, h: { base: hue, to: hue + 120, source: 'index', curve: 'linear' } }
}
