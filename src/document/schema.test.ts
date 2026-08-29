import { describe, it, expect } from 'vitest'
import { documentSchema } from './schema'
import { emptyDocument, defaultLayer } from './defaults'

describe('document schema', () => {
  it('accepts an empty document', () => {
    expect(documentSchema.safeParse(emptyDocument()).success).toBe(true)
  })

  it('accepts a document with a default layer', () => {
    const doc = emptyDocument()
    doc.layers.push(defaultLayer('halo'))
    expect(documentSchema.safeParse(doc).success).toBe(true)
  })

  it('accepts a modulated field', () => {
    const doc = emptyDocument()
    const layer = defaultLayer('halo')
    layer.repeaters[0].spin = { base: 0, to: 360, source: 'index', curve: 'linear' }
    doc.layers.push(layer)
    expect(documentSchema.safeParse(doc).success).toBe(true)
  })

  it('rejects an unknown shape type', () => {
    const doc = emptyDocument()
    const layer = defaultLayer('halo')
    ;(layer.shape as { type: string }).type = 'dodecahedron'
    doc.layers.push(layer)
    expect(documentSchema.safeParse(doc).success).toBe(false)
  })

  it('rejects an out-of-range alpha', () => {
    const doc = emptyDocument()
    const layer = defaultLayer('halo')
    layer.style.fill!.a = 5
    doc.layers.push(layer)
    expect(documentSchema.safeParse(doc).success).toBe(false)
  })

  it('gives every new layer a distinct id', () => {
    expect(defaultLayer('a').id).not.toBe(defaultLayer('b').id)
  })

  it('defaults maxInstances to 100000', () => {
    expect(emptyDocument().maxInstances).toBe(100_000)
  })
})
