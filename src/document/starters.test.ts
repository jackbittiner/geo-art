import { describe, it, expect } from 'vitest'
import { STARTERS } from './starters'
import { documentSchema } from './schema'
import { evaluate } from '../geometry/evaluate'
import { EASINGS } from '../geometry/easing'
import { isModulated, type Field, type Modulated } from '../geometry/field'
import type { Document } from './schema'

/** Every Field anywhere in a document, so a coverage claim cannot miss one. */
function fields(doc: Document): Field[] {
  const out: Field[] = []
  const colour = (c: { l: Field; c: Field; h: Field; a: Field }) => out.push(c.l, c.c, c.h, c.a)
  colour(doc.canvas.background)
  for (const layer of doc.layers) {
    out.push(...Object.values(layer.shape).filter((v): v is Field => typeof v !== 'string'))
    for (const rep of layer.repeaters) {
      out.push(...Object.values(rep).filter((v): v is Field => typeof v !== 'string'))
    }
    if (layer.style.fill) colour(layer.style.fill)
    if (layer.style.stroke) {
      colour(layer.style.stroke.colour)
      out.push(layer.style.stroke.width)
    }
  }
  return out
}

function modulators(): Modulated[] {
  return STARTERS.flatMap((s) => fields(s.build()).filter(isModulated))
}

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

/**
 * The gallery is the only place a new user meets the engine, so it doubles as
 * the feature tour. These pin that tour: a change that quietly drops the last
 * grid, the last three-deep chain or the last use of `level` from every starter
 * leaves the software's headline capabilities undemonstrated, and nothing else
 * in the suite would notice.
 */
describe('starters showcase the engine', () => {
  it('uses every repeater type', () => {
    const types = new Set(
      STARTERS.flatMap((s) => s.build().layers.flatMap((l) => l.repeaters.map((r) => r.type))),
    )
    expect([...types].sort()).toEqual(['grid', 'radial'])
  })

  it('uses every modulation source the engine implements', () => {
    const sources = new Set(modulators().map((m) => m.source))
    expect([...sources].sort()).toEqual(['flatIndex', 'index', 't'])
  })

  it('uses every easing', () => {
    const curves = new Set(modulators().map((m) => m.curve))
    expect([...curves].sort()).toEqual([...EASINGS].sort())
  })

  it('demonstrates cycles and level', () => {
    expect(modulators().some((m) => (m.cycles ?? 1) > 1)).toBe(true)
    expect(modulators().some((m) => m.level !== undefined)).toBe(true)
  })

  it('chains repeaters, at least one of them three deep', () => {
    const depths = STARTERS.flatMap((s) => s.build().layers.map((l) => l.repeaters.length))
    expect(depths.filter((d) => d >= 2).length).toBeGreaterThanOrEqual(4)
    expect(Math.max(...depths)).toBeGreaterThanOrEqual(3)
  })

  it('modulates shape geometry, not just placement and colour', () => {
    const shapes = STARTERS.flatMap((s) => s.build().layers.map((l) => l.shape))
    const modulatedShape = shapes.some((shape) =>
      Object.values(shape).some((v) => typeof v !== 'string' && isModulated(v)),
    )
    expect(modulatedShape).toBe(true)
  })

  it('keeps every starter small enough to snapshot instance by instance', () => {
    for (const starter of STARTERS) {
      // snapshot.test.ts records a transform and a fill per instance. Cheap to
      // read at these counts; unreviewable in a diff at thousands.
      expect(evaluate(starter.build()).totalInstances).toBeLessThanOrEqual(300)
    }
  })
})
