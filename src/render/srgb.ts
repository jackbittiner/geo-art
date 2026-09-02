/**
 * OKLCH <-> sRGB hex, for the colour picker's plane and its hex box.
 *
 * The document stores OKLCH and the renderer emits `oklch()` directly (see
 * colour.ts), so nothing in the drawing path passes through here -- this
 * exists purely so the Inspector can paint swatches the browser would
 * otherwise have to compute, and accept a hex code typed by hand.
 */

/** A colour with its channels already resolved; alpha is handled separately. */
export type Oklch = { l: number; c: number; h: number }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** sRGB transfer function and its inverse. */
const encode = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)
const decode = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))

/**
 * OKLCH describes colours sRGB cannot reach -- a chroma of 0.4 has no hex code
 * at any hue. Each channel is clamped independently, which is the cheap
 * approximation every browser makes for `oklch()` too, so the swatch matches
 * what the canvas will actually paint. The document keeps the true value; only
 * this readout rounds.
 */
export function oklchToHex({ l, c, h }: Oklch): string {
  const rad = (((h % 360) + 360) % 360) * (Math.PI / 180)
  const a = c * Math.cos(rad)
  const b = c * Math.sin(rad)

  const lc = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mc = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const sc = (l - 0.0894841775 * a - 1.291485548 * b) ** 3

  const channels = [
    4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc,
    -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc,
    -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc,
  ]

  return (
    '#' +
    channels
      .map((v) =>
        Math.round(clamp01(encode(v)) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
      .toUpperCase()
  )
}

/** Null for anything that is not a six digit hex code, with or without a `#`. */
export function hexToOklch(hex: string): Oklch | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const packed = parseInt(match[1], 16)

  const r = decode(((packed >> 16) & 255) / 255)
  const g = decode(((packed >> 8) & 255) / 255)
  const b = decode((packed & 255) / 255)

  const lc = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const mc = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const sc = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  const l = 0.2104542553 * lc + 0.793617785 * mc - 0.0040720468 * sc
  const a = 1.9779984951 * lc - 2.428592205 * mc + 0.4505937099 * sc
  const bb = 0.0259040371 * lc + 0.7827717662 * mc - 0.808675766 * sc

  return {
    l,
    c: Math.hypot(a, bb),
    h: ((Math.atan2(bb, a) * (180 / Math.PI)) % 360 + 360) % 360,
  }
}
