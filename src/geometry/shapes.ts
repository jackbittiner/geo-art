import { transformPath, type Path, type Segment } from './path'
import { degToRad, rotate } from './transform'

/** Circle-to-cubic-bezier constant. */
const KAPPA = 0.5522847498307936

export function polygon(sides: number, radius: number, rotationDeg = 0): Path {
  const n = Math.max(3, Math.round(sides))
  const phase = degToRad(rotationDeg) - Math.PI / 2
  const segments: Segment[] = []
  for (let i = 0; i < n; i++) {
    const a = phase + (i * 2 * Math.PI) / n
    const p = { x: radius * Math.cos(a), y: radius * Math.sin(a) }
    segments.push(i === 0 ? { c: 'M', p } : { c: 'L', p })
  }
  segments.push({ c: 'Z' })
  return { segments }
}

export function ellipse(rx: number, ry: number, rotationDeg = 0): Path {
  const ox = rx * KAPPA
  const oy = ry * KAPPA
  const path: Path = {
    segments: [
      { c: 'M', p: { x: 0, y: -ry } },
      { c: 'C', c1: { x: ox, y: -ry }, c2: { x: rx, y: -oy }, p: { x: rx, y: 0 } },
      { c: 'C', c1: { x: rx, y: oy }, c2: { x: ox, y: ry }, p: { x: 0, y: ry } },
      { c: 'C', c1: { x: -ox, y: ry }, c2: { x: -rx, y: oy }, p: { x: -rx, y: 0 } },
      { c: 'C', c1: { x: -rx, y: -oy }, c2: { x: -ox, y: -ry }, p: { x: 0, y: -ry } },
      { c: 'Z' },
    ],
  }
  // A true circle (rx === ry) is rotationally symmetric about its own centre: rotating
  // its control-point layout produces a visually and dimensionally identical shape, but
  // the *conservative* bbox (which includes control points lying outside the true radius,
  // at non-axis-aligned angles) is not actually invariant under that rotation. Skipping the
  // transform for this degenerate case keeps the rendered result identical while avoiding
  // that spurious bbox growth.
  return rotationDeg === 0 || rx === ry ? path : transformPath(path, rotate(degToRad(rotationDeg)))
}
