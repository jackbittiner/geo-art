import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { serialize, deserialize, CURRENT_VERSION } from './serialize'
import { emptyDocument, defaultLayer } from './defaults'

describe('serialize', () => {
  it('round-trips an empty document', () => {
    const doc = emptyDocument()
    expect(deserialize(serialize(doc))).toEqual(doc)
  })

  it('round-trips a document with layers and a modulated field', () => {
    const doc = emptyDocument()
    const layer = defaultLayer('halo')
    layer.repeaters[0].spin = { base: 0, to: 360, source: 'index', curve: 'easeOut', cycles: 2 }
    doc.layers.push(layer)
    expect(deserialize(serialize(doc))).toEqual(doc)
  })

  it('writes the current version', () => {
    expect(JSON.parse(serialize(emptyDocument())).version).toBe(CURRENT_VERSION)
  })

  it('rejects malformed JSON with a readable message', () => {
    expect(() => deserialize('{not json')).toThrow(/could not be read/i)
  })

  it('rejects a document that fails validation', () => {
    expect(() => deserialize(JSON.stringify({ version: 1 }))).toThrow(/not a valid/i)
  })

  it('rejects a future version', () => {
    const raw = { ...emptyDocument(), version: 99 }
    expect(() => deserialize(JSON.stringify(raw))).toThrow(/newer version/i)
  })

  // A structural (deep) comparison, not a raw-string one: JSON.stringify
  // equality would also fail on harmless key-order differences introduced by
  // zod rebuilding the object from its schema shape, and would pass or fail
  // for reasons unrelated to whether the *data* survived. toEqual compares
  // the documents themselves, which is what "lossless" actually means here.
  it('survives a round-trip for any generated layer count', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 12 }), (n) => {
        const doc = emptyDocument()
        for (let i = 0; i < n; i++) doc.layers.push(defaultLayer(`layer ${i}`))
        expect(deserialize(serialize(doc))).toEqual(doc)
      }),
    )
  })
})
