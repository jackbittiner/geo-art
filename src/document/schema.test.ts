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

  it('accepts chroma up to the renderer clamp and rejects beyond it', () => {
    const doc = emptyDocument()
    const layer = defaultLayer('halo')
    doc.layers.push(layer)
    layer.style.fill!.c = 0.5
    expect(documentSchema.safeParse(doc).success).toBe(true)
    layer.style.fill!.c = 0.51
    expect(documentSchema.safeParse(doc).success).toBe(false)
  })

  it('gives each document its own background object', () => {
    const a = emptyDocument()
    const b = emptyDocument()
    expect(a.canvas.background).not.toBe(b.canvas.background)
    a.canvas.background.l = 0.1
    expect(b.canvas.background.l).toBe(0.98)
  })

  it('gives every new layer a distinct id', () => {
    expect(defaultLayer('a').id).not.toBe(defaultLayer('b').id)
  })

  it('defaults maxInstances to 100000', () => {
    expect(emptyDocument().maxInstances).toBe(100_000)
  })
  // The engine (geometry/field.ts) throws on 'depth', 'radius' and 'angle'.
  // While the schema accepted them, such a file parsed, reached setDoc and
  // then threw during render, blanking the page; rejecting at load time is
  // the difference between a readable message and a dead app.
  it.each(['depth', 'radius', 'angle'])('rejects the unimplemented source %s', (source) => {
    const doc = emptyDocument()
    const layer = defaultLayer('halo')
    layer.repeaters[0].spin = { base: 0, to: 360, source, curve: 'linear' } as never
    doc.layers.push(layer)
    expect(documentSchema.safeParse(doc).success).toBe(false)
  })
})
