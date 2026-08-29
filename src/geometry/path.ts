import { applyPoint, type Mat2D, type Point } from './transform'

export type { Point }

export type Segment =
  | { c: 'M'; p: Point }
  | { c: 'L'; p: Point }
  | { c: 'C'; c1: Point; c2: Point; p: Point }
  | { c: 'Z' }

export type Path = { segments: Segment[] }

export type Rect = { x: number; y: number; w: number; h: number }

function pointsOf(seg: Segment): Point[] {
  switch (seg.c) {
    case 'M':
    case 'L':
      return [seg.p]
    case 'C':
      return [seg.c1, seg.c2, seg.p]
    case 'Z':
      return []
  }
}

/** Conservative for cubics: includes control points. */
export function bbox(path: Path): Rect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const seg of path.segments) {
    for (const p of pointsOf(seg)) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }
  if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function transformPath(path: Path, m: Mat2D): Path {
  return {
    segments: path.segments.map((seg): Segment => {
      switch (seg.c) {
        case 'M':
          return { c: 'M', p: applyPoint(m, seg.p) }
        case 'L':
          return { c: 'L', p: applyPoint(m, seg.p) }
        case 'C':
          return {
            c: 'C',
            c1: applyPoint(m, seg.c1),
            c2: applyPoint(m, seg.c2),
            p: applyPoint(m, seg.p),
          }
        case 'Z':
          return { c: 'Z' }
      }
    }),
  }
}
