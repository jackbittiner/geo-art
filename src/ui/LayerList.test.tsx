// @vitest-environment jsdom
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import LayerList from './LayerList'
import { useStore } from '../state/store'
import { emptyDocument, defaultLayer } from '../document/defaults'

/**
 * Seeds the store with layers named `names`, in document order (so
 * names[0] ends up at the bottom of the stack). When `counts` is given,
 * each layer's single radial repeater gets that count instead of
 * `defaultLayer`'s default of 12 -- used to give layers distinct instance
 * counts so a count-by-index bug (as opposed to count-by-id) is
 * detectable.
 */
function seed(names: string[], counts?: number[]) {
  const doc = emptyDocument()
  names.forEach((n, i) => {
    const layer = defaultLayer(n)
    if (counts) layer.repeaters[0].count = counts[i]
    doc.layers.push(layer)
  })
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
    // Distinct counts per layer: if the component read perLayerCounts by
    // array index instead of by layer.id, row 0 ('top', doc index 1) would
    // show the wrong value here (5 instead of 9), so a mis-association is
    // observable. This also pins the reverse-ordering: row 0 is the top
    // layer's count, row 1 is the bottom layer's.
    seed(['bottom', 'top'], [5, 9])
    render(<LayerList />)
    const rows = screen.getAllByTestId('layer-row')
    expect(within(rows[0]).getByText('9')).toBeDefined()
    expect(within(rows[1]).getByText('5')).toBeDefined()
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

  it('deletes a layer without selecting the removed layer', () => {
    render(<LayerList />)
    // Pin selection to the layer that survives ('bottom'). If the delete
    // button's click were to bubble to the row, the row's onClick would
    // fire select(layer.id) with the *removed* layer's id -- reconcileSelection
    // only runs inside apply/setDoc, not select, so that id would stick even
    // though the layer is gone. Asserting the surviving id is unchanged
    // catches that.
    const bottomId = useStore.getState().doc.layers[0].id
    useStore.getState().select(bottomId)
    fireEvent.click(within(screen.getAllByTestId('layer-row')[0]).getByRole('button', { name: 'Delete layer' }))
    expect(useStore.getState().doc.layers.map((l) => l.name)).toEqual(['bottom'])
    expect(useStore.getState().selectedLayerId).toBe(bottomId)
  })

  it('duplicates a layer without selecting the duplicated row', () => {
    render(<LayerList />)
    const bottomId = useStore.getState().doc.layers[0].id
    useStore.getState().select(bottomId)
    fireEvent.click(within(screen.getAllByTestId('layer-row')[0]).getByRole('button', { name: 'Duplicate layer' }))
    expect(useStore.getState().doc.layers.map((l) => l.name)).toEqual(['bottom', 'top', 'top copy'])
    expect(useStore.getState().selectedLayerId).toBe(bottomId)
  })

  it('moves a layer up the stack without selecting the moved row', () => {
    render(<LayerList />)
    const topId = useStore.getState().doc.layers[1].id
    useStore.getState().select(topId)
    fireEvent.click(within(screen.getAllByTestId('layer-row')[1]).getByRole('button', { name: 'Move up' }))
    expect(useStore.getState().doc.layers.map((l) => l.name)).toEqual(['top', 'bottom'])
    expect(useStore.getState().selectedLayerId).toBe(topId)
  })

  it('renders an empty list without crashing', () => {
    seed([])
    render(<LayerList />)
    expect(screen.queryAllByTestId('layer-row')).toHaveLength(0)
  })
})
