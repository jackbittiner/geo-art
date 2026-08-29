import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { STARTERS } from '../document/starters'

const round = (n: number) => Number(n.toFixed(3))

/**
 * Visual regression without pixels: snapshot the instance list. Deterministic,
 * readable in a diff, and it fails on the geometry rather than on the browser's
 * rasteriser.
 */
describe('starter instance snapshots', () => {
  for (const starter of STARTERS) {
    it(`is stable for "${starter.name}"`, () => {
      const result = evaluate(starter.build())
      const summary = result.layers.map((layer) => ({
        layerId: layer.layerId,
        count: layer.instances.length,
        transforms: layer.instances.map((i) => i.transform.map(round)),
        fills: layer.instances.map((i) =>
          i.style.fill
            ? [round(i.style.fill.l), round(i.style.fill.c), round(i.style.fill.h), round(i.style.fill.a)]
            : null,
        ),
      }))
      expect(summary).toMatchSnapshot()
    })
  }
})
