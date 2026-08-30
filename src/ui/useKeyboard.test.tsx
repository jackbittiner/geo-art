// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useKeyboard } from './useKeyboard'
import { useStore } from '../state/store'
import { emptyHistory } from '../state/history'
import { emptyDocument } from '../document/defaults'
import { setCanvasSize } from '../document/ops'

function Harness() {
  useKeyboard()
  return (
    <>
      <input aria-label="a field" />
      <input aria-label="a number field" type="number" />
      <input aria-label="a slider" type="range" />
    </>
  )
}

describe('useKeyboard', () => {
  beforeEach(() => {
    useStore.setState({ doc: emptyDocument(), selectedLayerId: null, history: emptyHistory() })
  })

  it('undoes on meta+z', () => {
    render(<Harness />)
    useStore.getState().apply((d) => setCanvasSize(d, 800, 600))
    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    expect(useStore.getState().doc.canvas.width).toBe(1200)
  })

  it('undoes on ctrl+z, for anyone not on a Mac', () => {
    render(<Harness />)
    useStore.getState().apply((d) => setCanvasSize(d, 800, 600))
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(useStore.getState().doc.canvas.width).toBe(1200)
  })

  it('redoes on shift+meta+z', () => {
    render(<Harness />)
    useStore.getState().apply((d) => setCanvasSize(d, 800, 600))
    useStore.getState().undo()
    fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true })
    expect(useStore.getState().doc.canvas.width).toBe(800)
  })

  it('ignores a plain z', () => {
    render(<Harness />)
    useStore.getState().apply((d) => setCanvasSize(d, 800, 600))
    fireEvent.keyDown(window, { key: 'z' })
    expect(useStore.getState().doc.canvas.width).toBe(800)
  })

  it('leaves text entry to its own native undo', () => {
    render(<Harness />)
    useStore.getState().apply((d) => setCanvasSize(d, 800, 600))
    fireEvent.keyDown(screen.getByLabelText('a field'), { key: 'z', metaKey: true })
    expect(useStore.getState().doc.canvas.width).toBe(800)
  })

  // TopBar's canvas size boxes are type="number", and they are the controls
  // the exclusion was actually written for: a number field has a real native
  // undo, and stealing ⌘Z from a half-typed "80" would be worse than useless.
  it('leaves a number field to its own native undo', () => {
    render(<Harness />)
    useStore.getState().apply((d) => setCanvasSize(d, 800, 600))
    const field = screen.getByLabelText('a number field')
    field.focus()
    fireEvent.keyDown(field, { key: 'z', metaKey: true })
    expect(useStore.getState().doc.canvas.width).toBe(800)
  })

  // A range input keeps focus after a drag, and holds it throughout arrow-key
  // nudging. Excluding every INPUT therefore swallowed ⌘Z after *any* slider
  // gesture -- which is every editable control in the Inspector -- to protect
  // a native undo that a range does not have.
  it('undoes while a slider still holds focus', () => {
    render(<Harness />)
    useStore.getState().apply((d) => setCanvasSize(d, 800, 600))
    const slider = screen.getByLabelText('a slider')
    slider.focus()
    fireEvent.keyDown(slider, { key: 'z', metaKey: true })
    expect(useStore.getState().doc.canvas.width).toBe(1200)
  })

  it('stops listening when unmounted', () => {
    const { unmount } = render(<Harness />)
    useStore.getState().apply((d) => setCanvasSize(d, 800, 600))
    unmount()
    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    expect(useStore.getState().doc.canvas.width).toBe(800)
  })
})
