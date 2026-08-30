import { describe, it, expect } from 'vitest'
import { bbox, transformPath, type Path } from './path'
import { translate, scale } from './transform'

const square: Path = {
  segments: [
    { c: 'M', p: { x: -1, y: -1 } },
    { c: 'L', p: { x: 1, y: -1 } },
    { c: 'L', p: { x: 1, y: 1 } },
    { c: 'L', p: { x: -1, y: 1 } },
    { c: 'Z' },
  ],
}

describe('path', () => {
  it('computes a bounding box', () => {
    expect(bbox(square)).toEqual({ x: -1, y: -1, w: 2, h: 2 })
  })

  it('includes cubic control points in the bounding box', () => {
    const curved: Path = {
      segments: [
        { c: 'M', p: { x: 0, y: 0 } },
        { c: 'C', c1: { x: 0, y: 10 }, c2: { x: 5, y: 10 }, p: { x: 5, y: 0 } },
      ],
    }
    expect(bbox(curved)).toEqual({ x: 0, y: 0, w: 5, h: 10 })
  })

  it('returns a zero rect for an empty path', () => {
    expect(bbox({ segments: [] })).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })

  it('transforms every point and leaves the original untouched', () => {
    const moved = transformPath(square, translate(10, 0))
    expect(bbox(moved)).toEqual({ x: 9, y: -1, w: 2, h: 2 })
    expect(bbox(square)).toEqual({ x: -1, y: -1, w: 2, h: 2 })
  })

  it('transforms cubic control points too', () => {
    const curved: Path = {
      segments: [
        { c: 'M', p: { x: 0, y: 0 } },
        { c: 'C', c1: { x: 1, y: 1 }, c2: { x: 2, y: 2 }, p: { x: 3, y: 3 } },
      ],
    }
    const out = transformPath(curved, scale(2, 2))
    expect(out.segments[1]).toEqual({
      c: 'C',
      c1: { x: 2, y: 2 },
      c2: { x: 4, y: 4 },
      p: { x: 6, y: 6 },
    })
  })
})
