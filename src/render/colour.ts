import type { ResolvedColour } from '../geometry/instance'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const trim = (v: number) => String(Number(v.toFixed(4)))

export function colourToCss(colour: ResolvedColour): string {
  const l = trim(clamp(colour.l, 0, 1) * 100)
  const c = trim(clamp(colour.c, 0, 0.5))
  const h = trim(((colour.h % 360) + 360) % 360)
  const a = trim(clamp(colour.a, 0, 1))
  return `oklch(${l}% ${c} ${h} / ${a})`
}

/**
 * Building an oklch() string per instance per frame is real garbage pressure at
 * 50k instances, so quantise and memoise: tens of thousands of instances rarely
 * need more than a few hundred distinct colours.
 */
export function createColourCache(): (colour: ResolvedColour) => string {
  const cache = new Map<string, string>()
  return (colour) => {
    const key = `${colour.l.toFixed(3)}|${colour.c.toFixed(3)}|${colour.h.toFixed(1)}|${colour.a.toFixed(3)}`
    let css = cache.get(key)
    if (css === undefined) {
      css = colourToCss(colour)
      cache.set(key, css)
    }
    return css
  }
}
