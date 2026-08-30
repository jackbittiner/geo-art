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
  return <input aria-label="a field" />
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

  it('leaves form controls to their own native undo', () => {
    render(<Harness />)
    useStore.getState().apply((d) => setCanvasSize(d, 800, 600))
    fireEvent.keyDown(screen.getByLabelText('a field'), { key: 'z', metaKey: true })
    expect(useStore.getState().doc.canvas.width).toBe(800)
  })

  it('stops listening when unmounted', () => {
    const { unmount } = render(<Harness />)
    useStore.getState().apply((d) => setCanvasSize(d, 800, 600))
    unmount()
    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    expect(useStore.getState().doc.canvas.width).toBe(800)
  })
})
