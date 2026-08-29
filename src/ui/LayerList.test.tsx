// @vitest-environment jsdom
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import LayerList from './LayerList'
import { useStore } from '../state/store'
import { emptyDocument, defaultLayer } from '../document/defaults'

function seed(names: string[]) {
  const doc = emptyDocument()
  for (const n of names) doc.layers.push(defaultLayer(n))
  useStore.setState({ doc, selectedLayerId: doc.layers[0]?.id ?? null })
  return doc
}

describe('LayerList', () => {
  beforeEach(() => { seed(['bottom', 'top']) })

  it('lists layers top of stack first', () => {
    render(<LayerList />)
    const rows = screen.getAllByTestId('layer-row')
    expect(within(rows[0]).getByText('top')).toBeDefined()
    expect(within(rows[1]).getByText('bottom')).toBeDefined()
  })

  it('shows each layer instance count', () => {
    render(<LayerList />)
    expect(within(screen.getAllByTestId('layer-row')[0]).getByText('12')).toBeDefined()
  })

  it('selects a layer on click', () => {
    render(<LayerList />)
    fireEvent.click(screen.getAllByTestId('layer-row')[0])
    expect(useStore.getState().selectedLayerId).toBe(useStore.getState().doc.layers[1].id)
  })

  it('adds a layer', () => {
    render(<LayerList />)
    fireEvent.click(screen.getByRole('button', { name: 'Add layer' }))
    expect(useStore.getState().doc.layers).toHaveLength(3)
  })

  it('toggles visibility without selecting', () => {
    render(<LayerList />)
    // Pin a known, non-null selection first (rather than null) so that if
    // the click's propagation to the row is NOT stopped, the row's own
    // onClick would flip selectedLayerId to the *clicked* layer's id --
    // which differs from this pinned value -- making the bug observable.
    // (Starting from null would still work here since the row's onClick
    // sets a non-null id, but pinning a distinct non-null value makes the
    // intent explicit and guards against a future accidental select(null).)
    const bottomId = useStore.getState().doc.layers[0].id
    useStore.getState().select(bottomId)
    fireEvent.click(within(screen.getAllByTestId('layer-row')[0]).getByRole('button', { name: 'Toggle visibility' }))
    expect(useStore.getState().doc.layers[1].visible).toBe(false)
    expect(useStore.getState().selectedLayerId).toBe(bottomId)
  })

  it('deletes a layer', () => {
    render(<LayerList />)
    fireEvent.click(within(screen.getAllByTestId('layer-row')[0]).getByRole('button', { name: 'Delete layer' }))
    expect(useStore.getState().doc.layers.map((l) => l.name)).toEqual(['bottom'])
  })

  it('duplicates a layer', () => {
    render(<LayerList />)
    fireEvent.click(within(screen.getAllByTestId('layer-row')[0]).getByRole('button', { name: 'Duplicate layer' }))
    expect(useStore.getState().doc.layers.map((l) => l.name)).toEqual(['bottom', 'top', 'top copy'])
  })

  it('moves a layer up the stack', () => {
    render(<LayerList />)
    fireEvent.click(within(screen.getAllByTestId('layer-row')[1]).getByRole('button', { name: 'Move up' }))
    expect(useStore.getState().doc.layers.map((l) => l.name)).toEqual(['top', 'bottom'])
  })

  it('renders an empty list without crashing', () => {
    seed([])
    render(<LayerList />)
    expect(screen.queryAllByTestId('layer-row')).toHaveLength(0)
  })
})
