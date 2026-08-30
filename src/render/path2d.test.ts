import { describe, it, expect, afterEach, vi } from 'vitest'
import { browserPath2D, createPath2DCache } from './path2d'
import type { Path } from '../geometry/path'

const path: Path = { segments: [{ c: 'M', p: { x: 0, y: 0 } }, { c: 'Z' }] }

describe('createPath2DCache', () => {
  it('builds once per Path object identity', () => {
    const factory = vi.fn(() => ({}))
    const cached = createPath2DCache(factory)
    const a = cached(path)
    const b = cached(path)
    expect(a).toBe(b)
    expect(factory).toHaveBeenCalledTimes(1)
  })

  it('builds again for a different Path object', () => {
    const factory = vi.fn(() => ({}))
    const cached = createPath2DCache(factory)
    cached(path)
    cached({ segments: [...path.segments] })
    expect(factory).toHaveBeenCalledTimes(2)
  })
})

/**
 * browserPath2D is the one place geometry is handed to the platform, and every
 * mistake it can make is invisible to the rest of the suite: swapping a
 * cubic's two control points still draws a curve, and dropping closePath()
 * still draws an outline. Recording the exact call sequence is the only way to
 * see either. (The UI tests stub Path2D the same way; this one records.)
 */
type Call = [string, ...number[]]

const calls: Call[] = []

class RecordingPath2D {
  moveTo(x: number, y: number): void {
    calls.push(['moveTo', x, y])
  }
  lineTo(x: number, y: number): void {
    calls.push(['lineTo', x, y])
  }
  bezierCurveTo(
    c1x: number,
    c1y: number,
    c2x: number,
    c2y: number,
    x: number,
    y: number,
  ): void {
    calls.push(['bezierCurveTo', c1x, c1y, c2x, c2y, x, y])
  }
  closePath(): void {
    calls.push(['closePath'])
  }
}

describe('browserPath2D', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    calls.length = 0
  })

  it('replays every segment onto a Path2D in order, control points included', () => {
    vi.stubGlobal('Path2D', RecordingPath2D)

    const source: Path = {
      segments: [
        { c: 'M', p: { x: 1, y: 2 } },
        { c: 'L', p: { x: 3, y: 4 } },
        { c: 'C', c1: { x: 5, y: 6 }, c2: { x: 7, y: 8 }, p: { x: 9, y: 10 } },
        { c: 'Z' },
      ],
    }

    const built = browserPath2D(source)

    expect(built).toBeInstanceOf(RecordingPath2D)
    expect(calls).toEqual([
      ['moveTo', 1, 2],
      ['lineTo', 3, 4],
      // c1 first, then c2, then the endpoint -- swapping the two controls
      // still draws a curve, just the wrong one.
      ['bezierCurveTo', 5, 6, 7, 8, 9, 10],
      // A dropped closePath() leaves an open outline: no visible difference
      // under fill, a missing edge under stroke.
      ['closePath'],
    ])
  })
})
