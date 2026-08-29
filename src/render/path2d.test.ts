import { describe, it, expect, vi } from 'vitest'
import { createPath2DCache } from './path2d'
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
