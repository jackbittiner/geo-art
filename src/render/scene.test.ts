import { describe, it, expect } from 'vitest'
import { buildScene } from './scene'
import { evaluate } from '../geometry/evaluate'
import { emptyDocument, defaultLayer } from '../document/defaults'
// Both fixtures below are built by defaultLayer, which always seeds a radial
// repeater, so narrowing here is honest rather than a cast papering over doubt.
import type { RadialConfig } from '../geometry/repeaters'

describe('buildScene', () => {
  it('carries canvas size and background through', () => {
    const doc = emptyDocument()
    const scene = buildScene(doc, evaluate(doc))
    expect(scene.width).toBe(1200)
    expect(scene.height).toBe(1200)
    expect(scene.background).toEqual({ l: 0.98, c: 0.005, h: 250, a: 1 })
  })

  it('keeps layers separate and in painter order', () => {
    const doc = emptyDocument()
    doc.layers.push(defaultLayer('bottom'), defaultLayer('top'))
    ;(doc.layers[0].repeaters[0] as RadialConfig).count = 3
    ;(doc.layers[1].repeaters[0] as RadialConfig).count = 5
    const scene = buildScene(doc, evaluate(doc))
    expect(scene.layers.map((l) => l.instances.length)).toEqual([3, 5])
  })

  it('resolves a modulated background channel against the root context, not an instance context', () => {
    const doc = emptyDocument()
    // A layer with 12 instances (flatIndex 0..11, total 12) exists specifically so that,
    // if buildScene mistakenly resolved the background against any of this layer's
    // per-instance contexts instead of rootContext(), the flatIndex-sourced field below
    // would resolve to something other than its base value.
    doc.layers.push(defaultLayer('a'))
    doc.canvas.background = {
      l: { base: 0.1, to: 0.9, source: 'flatIndex', curve: 'linear' },
      c: 0.005,
      h: 250,
      a: 1,
    }
    const scene = buildScene(doc, evaluate(doc))
    // rootContext() has total <= 1, so a flatIndex-sourced field resolves to its base (0.1).
    // Any of the layer's instance contexts (total 12, flatIndex 0..11) would instead
    // produce a value strictly between 0.1 and 0.9 for indices > 0, or exactly 0.9 for
    // the last instance -- so this genuinely distinguishes root-context resolution.
    expect(scene.background.l).toBe(0.1)
  })
})
