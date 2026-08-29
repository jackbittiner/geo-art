// @vitest-environment jsdom
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import TopBar from './TopBar'
import { useStore } from '../state/store'
import { emptyDocument, defaultLayer } from '../document/defaults'

describe('TopBar', () => {
  beforeEach(() => {
    const doc = emptyDocument()
    doc.layers.push(defaultLayer('halo'))
    useStore.setState({ doc, selectedLayerId: null })
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
})
