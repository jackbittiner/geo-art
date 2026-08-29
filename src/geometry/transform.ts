export type Point = { x: number; y: number }

/** [a, b, c, d, e, f] — standard 2D affine matrix format. */
export type Mat2D = readonly [number, number, number, number, number, number]

export const IDENTITY: Mat2D = [1, 0, 0, 1, 0, 0]

/** compose(outer, inner) applies `inner` first, then `outer`. */
export function compose(outer: Mat2D, inner: Mat2D): Mat2D {
  const [a1, b1, c1, d1, e1, f1] = outer
  const [a2, b2, c2, d2, e2, f2] = inner
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ]
}

export function translate(tx: number, ty: number): Mat2D {
  return [1, 0, 0, 1, tx, ty]
}

export function rotate(radians: number): Mat2D {
  const c = Math.cos(radians)
  const s = Math.sin(radians)
  return [c, s, -s, c, 0, 0]
}

export function scale(sx: number, sy: number = sx): Mat2D {
  return [sx, 0, 0, sy, 0, 0]
}

export function applyPoint(m: Mat2D, p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }
}

export function determinant(m: Mat2D): number {
  return m[0] * m[3] - m[1] * m[2]
}

export function invert(m: Mat2D): Mat2D {
  const det = determinant(m)
  if (det === 0) throw new Error('Matrix is not invertible')
  const [a, b, c, d, e, f] = m
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]
}

export const degToRad = (deg: number): number => (deg * Math.PI) / 180
