import { describe, it, expect } from 'vitest'
import {
  emptyHistory, record, undo, redo, closeGroup, MAX_ENTRIES, COALESCE_IDLE_MS,
} from './history'
import { emptyDocument } from '../document/defaults'
import type { Document } from '../document/schema'

/** Documents that differ visibly, so an assertion names which one it got. */
const docWithSeed = (seed: number): Document => ({ ...emptyDocument(), seed })

const A = docWithSeed(1)
const B = docWithSeed(2)
const C = docWithSeed(3)

describe('record', () => {
  it('pushes the pre-edit document', () => {
    const h = record(emptyHistory(), A, null, 0)
    expect(h.past).toHaveLength(1)
    expect(h.past[0].doc.seed).toBe(1)
  })

  it('pushes nothing for the same key inside the idle window', () => {
    let h = record(emptyHistory(), A, 'fill-h', 0)
    h = record(h, B, 'fill-h', COALESCE_IDLE_MS - 1)
    expect(h.past).toHaveLength(1)
    // The surviving entry is the state before the gesture began, not mid-drag.
    expect(h.past[0].doc.seed).toBe(1)
  })

  it('pushes a new entry for the same key outside the idle window', () => {
    let h = record(emptyHistory(), A, 'fill-h', 0)
    h = record(h, B, 'fill-h', COALESCE_IDLE_MS)
    expect(h.past.map((e) => e.doc.seed)).toEqual([1, 2])
  })

  it('pushes for a different key however soon it arrives', () => {
    let h = record(emptyHistory(), A, 'fill-h', 0)
    h = record(h, B, 'fill-c', 1)
    expect(h.past.map((e) => e.doc.seed)).toEqual([1, 2])
  })

  it('never coalesces a null key with anything', () => {
    let h = record(emptyHistory(), A, null, 0)
    h = record(h, B, null, 1)
    expect(h.past.map((e) => e.doc.seed)).toEqual([1, 2])
  })

  it('clears the redo future', () => {
    const h = { past: [], future: [{ doc: C, key: null, at: 0 }] }
    expect(record(h, A, null, 0).future).toEqual([])
  })

  it('drops the oldest entry at the cap, keeping the newest', () => {
    let h = emptyHistory()
    for (let i = 0; i <= MAX_ENTRIES; i++) h = record(h, docWithSeed(i), null, i * 1000)
    expect(h.past).toHaveLength(MAX_ENTRIES)
    expect(h.past[0].doc.seed).toBe(1) // seed 0 was dropped
    expect(h.past.at(-1)!.doc.seed).toBe(MAX_ENTRIES)
  })
})

describe('closeGroup', () => {
  it('stops the next same-key op from joining the group', () => {
    let h = record(emptyHistory(), A, 'fill-h', 0)
    h = closeGroup(h)
    h = record(h, B, 'fill-h', 1)
    expect(h.past.map((e) => e.doc.seed)).toEqual([1, 2])
  })

  it('is a no-op on an empty history', () => {
    expect(closeGroup(emptyHistory())).toEqual(emptyHistory())
  })
})

describe('undo and redo', () => {
  it('returns null when there is nothing to undo', () => {
    expect(undo(emptyHistory(), A)).toBeNull()
  })

  it('returns null when there is nothing to redo', () => {
    expect(redo(emptyHistory(), A)).toBeNull()
  })

  it('restores the previous document and banks the current one', () => {
    const h = record(emptyHistory(), A, null, 0)
    const stepped = undo(h, B)!
    expect(stepped.doc.seed).toBe(1)
    expect(stepped.history.past).toHaveLength(0)
    expect(stepped.history.future.map((e) => e.doc.seed)).toEqual([2])
  })

  it('round-trips through undo and redo', () => {
    const h = record(emptyHistory(), A, null, 0)
    const back = undo(h, B)!
    const forward = redo(back.history, back.doc)!
    expect(forward.doc.seed).toBe(2)
    expect(forward.history.past.map((e) => e.doc.seed)).toEqual([1])
    expect(forward.history.future).toEqual([])
  })

  it('walks back through several entries in order', () => {
    let h = record(emptyHistory(), A, null, 0)
    h = record(h, B, null, 1000)
    const first = undo(h, C)!
    expect(first.doc.seed).toBe(2)
    const second = undo(first.history, first.doc)!
    expect(second.doc.seed).toBe(1)
  })
})
