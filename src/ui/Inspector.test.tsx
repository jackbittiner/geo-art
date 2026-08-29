// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import Inspector from './Inspector'
import { useStore } from '../state/store'
import { emptyDocument, defaultLayer } from '../document/defaults'

function seed() {
  const doc = emptyDocument()
  doc.layers.push(defaultLayer('halo'))
  useStore.setState({ doc, selectedLayerId: doc.layers[0].id })
  return doc
}

describe('Inspector', () => {
  beforeEach(() => { seed() })

  it('prompts when nothing is selected', () => {
    useStore.getState().select(null)
    render(<Inspector />)
    expect(screen.getByTestId('inspector-empty')).toBeDefined()
  })

  it('renders a card per section', () => {
    render(<Inspector />)
    expect(screen.getByTestId('card-shape')).toBeDefined()
    expect(screen.getByTestId('card-repeater-0')).toBeDefined()
    expect(screen.getByTestId('card-style')).toBeDefined()
  })

  it('renders one row per descriptor for the shape type', () => {
    render(<Inspector />)
    expect(screen.getByLabelText('shape sides')).toBeDefined()
    expect(screen.getByLabelText('shape radius')).toBeDefined()
    expect(screen.getByLabelText('shape rotation')).toBeDefined()
  })

  it('scopes labels so a shape and a repeater can share a field name', () => {
    render(<Inspector />)
    // Both the polygon and the radial repeater have a "radius" field.
    expect(screen.getByLabelText('shape radius')).toBeDefined()
    expect(screen.getByLabelText('repeat 1 radius')).toBeDefined()
  })

  it('edits a shape field', () => {
    render(<Inspector />)
    fireEvent.change(screen.getByLabelText('shape sides'), { target: { value: '8' } })
    expect(useStore.getState().doc.layers[0].shape).toMatchObject({ sides: 8 })
  })

  it('edits a repeater field', () => {
    render(<Inspector />)
    fireEvent.change(screen.getByLabelText('repeat 1 count'), { target: { value: '24' } })
    expect(useStore.getState().doc.layers[0].repeaters[0]).toMatchObject({ count: 24 })
  })

  it('edits a colour channel', () => {
    render(<Inspector />)
    fireEvent.change(screen.getByLabelText('fill hue'), { target: { value: '120' } })
    expect(useStore.getState().doc.layers[0].style.fill!.h).toBe(120)
  })

  it('swaps shape type and shows the new type fields', () => {
    render(<Inspector />)
    fireEvent.change(screen.getByLabelText('Shape type'), { target: { value: 'ellipse' } })
    expect(screen.getByLabelText('shape rx')).toBeDefined()
    expect(screen.queryByLabelText('shape sides')).toBeNull()
  })

  it('wires the new shape type fields to the new shape setter, not the old one', () => {
    // queryByLabelText('shape sides') returning null only proves the polygon
    // fields are gone -- it says nothing about whether the ellipse fields
    // that replaced them are actually wired to setShapeField for the new
    // shape. Edit one and confirm it lands on the ellipse config.
    render(<Inspector />)
    fireEvent.change(screen.getByLabelText('Shape type'), { target: { value: 'ellipse' } })
    fireEvent.change(screen.getByLabelText('shape rx'), { target: { value: '77' } })
    expect(useStore.getState().doc.layers[0].shape).toMatchObject({ type: 'ellipse', rx: 77 })
  })

  it('shows the running instance count on the repeater card, not the count field value', () => {
    // defaultLayer's count field is 12 and, with no truncation, the ring
    // also evaluates to 12 instances -- so a naive implementation that
    // rendered the raw `count` field here (instead of perLayerCounts) would
    // pass this test by coincidence. Cap maxInstances below the requested
    // count so the two numbers diverge, and assert the *evaluated* one.
    useStore.setState((s) => ({ doc: { ...s.doc, maxInstances: 5 } }))
    render(<Inspector />)
    expect(screen.getByTestId('card-repeater-0').textContent).toContain('5')
    // The requested count field (12) is still shown in its own row; only the
    // running total in the header should reflect truncation.
    const countInput = screen.getByLabelText('repeat 1 count') as HTMLInputElement
    expect(countInput.value).toBe('12')
  })

  it('renders a modulated field as a read-only chip', () => {
    const doc = useStore.getState().doc
    useStore.setState({
      doc: {
        ...doc,
        layers: [
          {
            ...doc.layers[0],
            repeaters: [
              { ...doc.layers[0].repeaters[0], spin: { base: 0, to: 360, source: 'index', curve: 'linear' } },
            ],
          },
        ],
      },
    })
    render(<Inspector />)
    expect(screen.getByTestId('modulated-repeat 1-spin')).toBeDefined()
    expect(screen.queryByLabelText('repeat 1 spin')).toBeNull()
  })

  it('omits the style card for a layer with no fill', () => {
    const doc = useStore.getState().doc
    useStore.setState({
      doc: {
        ...doc,
        layers: [{ ...doc.layers[0], style: {} }],
      },
    })
    render(<Inspector />)
    expect(screen.queryByTestId('card-style')).toBeNull()
    expect(screen.queryByLabelText('fill hue')).toBeNull()
  })

  it('renders no repeater cards for a layer with an empty repeater chain', () => {
    const doc = useStore.getState().doc
    useStore.setState({
      doc: {
        ...doc,
        layers: [{ ...doc.layers[0], repeaters: [] }],
      },
    })
    render(<Inspector />)
    expect(screen.queryByTestId('card-repeater-0')).toBeNull()
    // The shape and style cards -- unaffected by the repeater chain -- still render.
    expect(screen.getByTestId('card-shape')).toBeDefined()
    expect(screen.getByTestId('card-style')).toBeDefined()
  })
})
