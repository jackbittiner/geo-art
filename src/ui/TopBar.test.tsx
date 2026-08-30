// @vitest-environment jsdom
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import TopBar from './TopBar'
import { useStore } from '../state/store'
import { emptyHistory } from '../state/history'
import { emptyDocument, defaultLayer } from '../document/defaults'
import { setCanvasSize } from '../document/ops'
import { fitViewport } from './viewport'

describe('TopBar', () => {
  beforeEach(() => {
    const doc = emptyDocument()
    doc.layers.push(defaultLayer('halo'))
    useStore.setState({
      doc,
      selectedLayerId: null,
      viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
      viewSize: { width: 0, height: 0 },
      history: emptyHistory(),
    })
  })

  it('shows the total instance count', () => {
    render(<TopBar />)
    // Exact match, not `.toContain('12')`: the single 'halo' layer's radial
    // repeater (count 12) is the only source of instances, so the count must
    // read exactly "12 shapes" -- a `.toContain('12')` check would also pass
    // for a wrong total like "120 shapes" or "312 shapes".
    expect(screen.getByTestId('instance-count').textContent).toBe('12 shapes')
  })

  it('edits the canvas width', () => {
    render(<TopBar />)
    fireEvent.change(screen.getByLabelText('Canvas width'), { target: { value: '800' } })
    expect(useStore.getState().doc.canvas.width).toBe(800)
  })

  it('keeps a cleared canvas width field empty instead of snapping to 1', () => {
    render(<TopBar />)
    const input = screen.getByLabelText('Canvas width') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    expect(input.value).toBe('')
    expect(useStore.getState().doc.canvas.width).toBe(1200)
  })

  it('does not corrupt a value typed after clearing the width field', () => {
    // Simulates real keystrokes: each new value is the field's *actual*
    // rendered content plus one appended digit, not a hardcoded string. If
    // clearing the field snapped it back to "1" (the bug), the next digit
    // would append to that "1" instead of to an empty field.
    render(<TopBar />)
    const input = screen.getByLabelText('Canvas width') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    for (const digit of '500') {
      fireEvent.change(input, { target: { value: input.value + digit } })
    }
    expect(input.value).toBe('500')
    expect(useStore.getState().doc.canvas.width).toBe(500)
  })

  it('warns when the instance budget truncates', () => {
    useStore.setState((s) => ({ doc: { ...s.doc, maxInstances: 5 } }))
    render(<TopBar />)
    expect(screen.getByTestId('truncation-warning')).toBeDefined()
  })

  it('shows no warning when everything fits', () => {
    render(<TopBar />)
    expect(screen.queryByTestId('truncation-warning')).toBeNull()
  })

  it('offers a PNG export control', () => {
    render(<TopBar />)
    expect(screen.getByRole('button', { name: /Export PNG/ })).toBeDefined()
  })

  it('offers save and load controls', () => {
    render(<TopBar />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDefined()
    expect(screen.getByLabelText('Load document')).toBeDefined()
  })

  // The width field's displayed text is local component state, synced from
  // the document by an effect (`useEffect(() => setText(...), [value])`).
  // That effect has no direct test elsewhere, yet it is exactly what a file
  // load depends on to refresh the displayed size -- setDoc replaces
  // doc.canvas.width from outside the input, same as this direct
  // useStore.setState does. If that sync effect were missing or broken, the
  // field would keep showing the stale value after a load.
  it('updates the displayed width when the document changes from outside the input', () => {
    render(<TopBar />)
    const input = screen.getByLabelText('Canvas width') as HTMLInputElement
    expect(input.value).toBe('1200')

    act(() => {
      useStore.setState((s) => ({ doc: { ...s.doc, canvas: { ...s.doc.canvas, width: 640 } } }))
    })

    expect(input.value).toBe('640')
  })
  // fitViewport was written, tested and unreachable: the fit ran once in a
  // mount effect and there was no control of any kind, so zooming out to
  // MIN_ZOOM left a page reload as the only way back.
  it('refits the viewport from the measured pane size', () => {
    useStore.setState({
      viewport: { pan: { x: 500, y: 500 }, zoom: 0.02 },
      viewSize: { width: 800, height: 600 },
    })
    render(<TopBar />)

    fireEvent.click(screen.getByRole('button', { name: 'Fit' }))

    const doc = useStore.getState().doc
    expect(useStore.getState().viewport).toEqual(
      fitViewport(doc.canvas, { width: 800, height: 600 }),
    )
    expect(useStore.getState().viewport.zoom).toBeGreaterThan(0.02)
  })

  it('falls back to the document canvas size when the pane has not been measured', () => {
    useStore.setState({ viewport: { pan: { x: 9, y: 9 }, zoom: 0.02 } })
    render(<TopBar />)

    fireEvent.click(screen.getByRole('button', { name: 'Fit' }))

    const doc = useStore.getState().doc
    expect(useStore.getState().viewport).toEqual(
      fitViewport(doc.canvas, { width: doc.canvas.width, height: doc.canvas.height }),
    )
  })

  it('disables undo and redo until there is something to step through', () => {
    render(<TopBar />)
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Redo' })).toHaveProperty('disabled', true)
  })

  it('undoes from the button', () => {
    render(<TopBar />)
    // Wrapped in act: React 19 batches this store mutation onto a microtask,
    // so an unwrapped call leaves the button's `disabled` attribute stale
    // (still true from the initial render) at the moment fireEvent.click
    // runs, and a disabled button drops the click before it ever reaches
    // onClick -- the same failure mode a genuinely broken canUndo wiring
    // would produce, so this had to be pinned down rather than glossed.
    act(() => {
      useStore.getState().apply((d) => setCanvasSize(d, 800, 600))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(useStore.getState().doc.canvas.width).toBe(1200)
  })

  // Lines 43-44 of TopBar are adjacent near-identical selectors (`past` vs
  // `future`) and lines 109/117 adjacent near-identical handlers, so a
  // copy-paste is the likeliest defect here. Nothing caught either: no test
  // had ever put the store in a redo-able state while a TopBar was rendered,
  // so `canRedo` hardcoded to false (a permanently dead button) and
  // onClick={redo} swapped for onClick={undo} both left the suite green.
  // Hence all three assertions: enabled, clickable, and lands on the redone
  // value by name.
  it('redoes from the button', () => {
    render(<TopBar />)
    // act() for the same reason as the undo test above: React 19 batches the
    // store mutation onto a microtask, leaving `disabled` stale otherwise.
    act(() => {
      useStore.getState().apply((d) => setCanvasSize(d, 800, 600))
    })
    act(() => {
      useStore.getState().undo()
    })
    expect(useStore.getState().doc.canvas.width).toBe(1200)

    expect(screen.getByRole('button', { name: 'Redo' })).toHaveProperty('disabled', false)
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))

    expect(useStore.getState().doc.canvas.width).toBe(800)
  })

  it('types a canvas size as one undo step, not one per keystroke', () => {
    render(<TopBar />)
    const input = screen.getByLabelText('Canvas width')
    fireEvent.change(input, { target: { value: '8' } })
    fireEvent.change(input, { target: { value: '80' } })
    fireEvent.change(input, { target: { value: '800' } })
    expect(useStore.getState().doc.canvas.width).toBe(800)
    expect(useStore.getState().history.past).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(useStore.getState().doc.canvas.width).toBe(1200)
  })
})
