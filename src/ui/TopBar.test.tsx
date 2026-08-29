// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
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
})
