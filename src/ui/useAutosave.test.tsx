// @vitest-environment jsdom
import { render, act } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { AUTOSAVE_DEBOUNCE_MS, useAutosave } from './useAutosave'
import { useStore } from '../state/store'
import { emptyDocument, defaultLayer } from '../document/defaults'
import { serialize } from '../document/serialize'

const KEY = 'geo-art:autosave'

function Harness() {
  useAutosave()
  return null
}

/**
 * Writes are debounced (see AUTOSAVE_DEBOUNCE_MS), so every assertion about
 * what reached storage has to run the clock forward first.
 */
function flushDebounce() {
  act(() => {
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
  })
}

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    useStore.setState({ doc: emptyDocument(), selectedLayerId: null })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('restores a saved document on mount', () => {
    const saved = emptyDocument()
    saved.layers.push(defaultLayer('restored'))
    localStorage.setItem(KEY, serialize(saved))

    render(<Harness />)

    expect(useStore.getState().doc.layers.map((l) => l.name)).toEqual(['restored'])
  })

  it('saves the document to localStorage on change', () => {
    render(<Harness />)

    const next = emptyDocument()
    next.layers.push(defaultLayer('edited'))
    act(() => {
      useStore.setState({ doc: next })
    })
    flushDebounce()

    const saved = localStorage.getItem(KEY)
    expect(saved).not.toBeNull()
    expect(JSON.parse(saved!).layers.map((l: { name: string }) => l.name)).toEqual(['edited'])
  })

  it('discards an unreadable saved document instead of crashing', () => {
    localStorage.setItem(KEY, '{not json')

    expect(() => render(<Harness />)).not.toThrow()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('does not crash when localStorage.setItem throws (e.g. quota exceeded)', () => {
    render(<Harness />)

    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    const next = emptyDocument()
    next.layers.push(defaultLayer('too-big'))
    expect(() => {
      act(() => {
        useStore.setState({ doc: next })
      })
      flushDebounce()
    }).not.toThrow()

    spy.mockRestore()
  })

  // Both effects fire on the same mount. If the save effect writes on that
  // first pass, it clobbers the saved document with the still-default store
  // state before the restore effect's setDoc has taken effect -- a real
  // data-loss window even though a later re-render papers over the visible
  // symptom (the corrected value gets written right after, once the restore
  // takes effect and this component re-renders). Guarding against this with
  // an identity check against the mount-time document closes the window
  // entirely, regardless of how many times the effect is invoked.
  //
  // NB: spying via `localStorage.setItem = vi.fn()` does not work in jsdom --
  // assigning to a property of the Storage object is itself a storage write
  // (per the Web Storage API), so the assignment silently no-ops as far as
  // interception goes. `vi.spyOn(Storage.prototype, 'setItem')` is the way
  // that actually observes every call.
  it('does not overwrite a saved document with the pre-restore default on mount', () => {
    const saved = emptyDocument()
    saved.layers.push(defaultLayer('must-survive'))
    localStorage.setItem(KEY, serialize(saved))

    const spy = vi.spyOn(Storage.prototype, 'setItem')
    render(<Harness />)
    flushDebounce()

    const writesToKey = spy.mock.calls.filter(([key]) => key === KEY)
    const everWroteEmptyLayers = writesToKey.some(
      ([, value]) => JSON.parse(value).layers.length === 0,
    )
    spy.mockRestore()

    expect(everWroteEmptyLayers).toBe(false)
    expect(JSON.parse(localStorage.getItem(KEY)!).layers.map((l: { name: string }) => l.name)).toEqual([
      'must-survive',
    ])
  })

  // The app always mounts inside <StrictMode> (see src/main.tsx), which in
  // development invokes every effect twice on mount (setup -> cleanup ->
  // setup) before the first invocation's state update commits. A run-counting
  // guard (e.g. "skip the first invocation") is consumed by the first
  // synthetic invocation and then runs for real on the *second* one, which
  // still sees the pre-restore default `doc` -- reproducing the exact clobber
  // the guard was meant to prevent. This is why the guard has to be an
  // identity check against the document present at mount, not a counter.
  it('does not overwrite a saved document with the pre-restore default on mount, under StrictMode', () => {
    const saved = emptyDocument()
    saved.layers.push(defaultLayer('must-survive'))
    localStorage.setItem(KEY, serialize(saved))

    const spy = vi.spyOn(Storage.prototype, 'setItem')
    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    )
    flushDebounce()

    const writesToKey = spy.mock.calls.filter(([key]) => key === KEY)
    const everWroteEmptyLayers = writesToKey.some(
      ([, value]) => JSON.parse(value).layers.length === 0,
    )
    spy.mockRestore()

    expect(everWroteEmptyLayers).toBe(false)
    expect(JSON.parse(localStorage.getItem(KEY)!).layers.map((l: { name: string }) => l.name)).toEqual([
      'must-survive',
    ])
  })

  // The behaviour a guard could over-correct into breaking: with nothing
  // saved, autosave must still persist the *first* genuine edit -- not skip
  // it because it happens to be the first change the effect ever sees, and
  // not require a second edit before anything is written. Rendered under
  // StrictMode since that's how the app actually mounts.
  it('saves on the first genuine edit, under StrictMode, when nothing was saved', () => {
    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    )

    expect(localStorage.getItem(KEY)).toBeNull()

    const next = emptyDocument()
    next.layers.push(defaultLayer('first-edit'))
    act(() => {
      useStore.setState({ doc: next })
    })
    flushDebounce()

    const saved = localStorage.getItem(KEY)
    expect(saved).not.toBeNull()
    expect(JSON.parse(saved!).layers.map((l: { name: string }) => l.name)).toEqual(['first-edit'])
  })
  // A slider drag emits a document change per pointermove. Undebounced, each
  // one paid a full JSON.stringify plus a synchronous localStorage write on
  // the interactive edit path; only the last document in a burst matters.
  it('writes once for a burst of edits, not once per edit', () => {
    render(<Harness />)

    const spy = vi.spyOn(Storage.prototype, 'setItem')
    for (let i = 1; i <= 20; i++) {
      const next = emptyDocument()
      next.layers.push(defaultLayer(`edit-${i}`))
      act(() => {
        useStore.setState({ doc: next })
      })
      act(() => {
        vi.advanceTimersByTime(10)
      })
    }
    expect(spy.mock.calls.filter(([key]) => key === KEY)).toHaveLength(0)

    flushDebounce()

    const writes = spy.mock.calls.filter(([key]) => key === KEY)
    spy.mockRestore()

    expect(writes).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(KEY)!).layers.map((l: { name: string }) => l.name)).toEqual([
      'edit-20',
    ])
  })

  // Debouncing must not turn "edit, then close the tab" into a lost edit.
  it('flushes a pending write on beforeunload', () => {
    render(<Harness />)

    const next = emptyDocument()
    next.layers.push(defaultLayer('closing-time'))
    act(() => {
      useStore.setState({ doc: next })
    })
    expect(localStorage.getItem(KEY)).toBeNull()

    act(() => {
      window.dispatchEvent(new Event('beforeunload'))
    })

    expect(JSON.parse(localStorage.getItem(KEY)!).layers.map((l: { name: string }) => l.name)).toEqual([
      'closing-time',
    ])

    // And the flush is not then duplicated when the debounce timer fires.
    const spy = vi.spyOn(Storage.prototype, 'setItem')
    flushDebounce()
    const writes = spy.mock.calls.filter(([key]) => key === KEY)
    spy.mockRestore()
    expect(writes).toHaveLength(0)
  })
})
