import { describe, it, expect } from 'vitest'
import { STARTERS } from './starters'
import { documentSchema } from './schema'
import { evaluate } from '../geometry/evaluate'

describe('starters', () => {
  it('ships at least three', () => {
    expect(STARTERS.length).toBeGreaterThanOrEqual(3)
  })

  it('every starter validates against the schema', () => {
    for (const starter of STARTERS) {
      expect(documentSchema.safeParse(starter.build()).success).toBe(true)
    }
  })

  it('every starter produces instances without truncating', () => {
    for (const starter of STARTERS) {
      const result = evaluate(starter.build())
      expect(result.totalInstances).toBeGreaterThan(0)
      expect(result.truncated).toBe(false)
    }
  })

  it('builds a fresh document each call', () => {
    const a = STARTERS[0].build()
    const b = STARTERS[0].build()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })

  it('has stable layer ids so snapshots do not churn', () => {
    expect(STARTERS[0].build().layers.map((l) => l.id)).toEqual(
      STARTERS[0].build().layers.map((l) => l.id),
    )
  })
})
