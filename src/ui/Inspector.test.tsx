// @vitest-environment jsdom
import { render, screen, fireEvent, within } from '@testing-library/react'
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

  it('renders the editor for a modulated field, not a read-only chip', () => {
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
    expect(screen.getByLabelText('repeat 1 spin to')).toBeDefined()
    expect(screen.getByLabelText('repeat 1 spin curve')).toBeDefined()
    // The first-line slider now edits base rather than disappearing.
    expect(screen.getByLabelText('repeat 1 spin')).toBeDefined()
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

  // The Aperture starter ships a modulated spin, which Phase 1 cannot edit --
  // without a way back to a constant the set's most interesting parameter is
  // untouchable. "constant" replaces the field with its base value.
  it('turns a modulated field back into a constant', () => {
    const doc = useStore.getState().doc
    useStore.setState({
      doc: {
        ...doc,
        layers: [
          {
            ...doc.layers[0],
            repeaters: [
              { ...doc.layers[0].repeaters[0], spin: { base: 15, to: 360, source: 'index', curve: 'linear' } },
            ],
          },
        ],
      },
    })
    render(<Inspector />)

    fireEvent.click(screen.getByLabelText('repeat 1 spin make constant'))

    expect(useStore.getState().doc.layers[0].repeaters[0]).toMatchObject({ spin: 15 })
    // And the editor is replaced by a plain, editable slider.
    expect(screen.queryByLabelText('repeat 1 spin to')).toBeNull()
    expect((screen.getByLabelText('repeat 1 spin') as HTMLInputElement).value).toBe('15')
  })
  // Both halves of a slider that was narrower than the data it edits: the
  // chroma descriptor capped at 0.4 while the schema and renderer allow 0.5,
  // and the default step of 1 snapped every fractional angle. Either one
  // rewrote a valid document the first time the slider was touched -- and the
  // displayed value disagreed with the document before that.
  it('renders values the schema allows but the sliders used to clamp or snap', () => {
    const doc = useStore.getState().doc
    const before = {
      ...doc,
      layers: [
        {
          ...doc.layers[0],
          repeaters: [{ ...doc.layers[0].repeaters[0], startAngle: 4.5 }],
          style: { fill: { ...doc.layers[0].style.fill!, c: 0.45 } },
        },
      ],
    }
    useStore.setState({ doc: before })
    render(<Inspector />)

    const chroma = screen.getByLabelText('fill chroma') as HTMLInputElement
    expect(chroma.value).toBe('0.45')
    expect(chroma.max).toBe('0.5')

    const startAngle = screen.getByLabelText('repeat 1 start') as HTMLInputElement
    expect(startAngle.value).toBe('4.5')
    // jsdom does not run the browser's step-snapping on render, so the value
    // above cannot catch a step of 1 on its own -- assert the step directly.
    // (In a browser, step=1 rewrites 4.5 to 5 the first time it is dragged.)
    expect(startAngle.step).toBe('any')
    // Fields that really are integral keep their explicit step.
    expect((screen.getByLabelText('repeat 1 count') as HTMLInputElement).step).toBe('1')
    expect((screen.getByLabelText('shape sides') as HTMLInputElement).step).toBe('1')

    // The readouts agree with the document, not with a clamped slider.
    expect(screen.getByTestId('card-style').textContent).toContain('0.45')
    expect(screen.getByTestId('card-repeater-0').textContent).toContain('4.5')

    // And rendering alone wrote nothing: the document is the same object.
    expect(useStore.getState().doc).toBe(before)
  })

  it('previews a colour ramp against the layer real copy count', () => {
    const doc = useStore.getState().doc
    useStore.setState({
      doc: {
        ...doc,
        layers: [
          {
            ...doc.layers[0],
            repeaters: [{ ...doc.layers[0].repeaters[0], count: 5 }],
            style: {
              fill: { l: 0.6, c: 0.2, h: { base: 0, to: 240, source: 'index', curve: 'linear' }, a: 1 },
            },
          },
        ],
      },
    })
    render(<Inspector />)
    expect(screen.getAllByTestId('ramp-cell')).toHaveLength(5)
  })

  it('builds hue swatches from the layer other channels', () => {
    const doc = useStore.getState().doc
    useStore.setState({
      doc: {
        ...doc,
        layers: [
          {
            ...doc.layers[0],
            repeaters: [{ ...doc.layers[0].repeaters[0], count: 2 }],
            style: {
              fill: { l: 0.6, c: 0.2, h: { base: 0, to: 240, source: 'index', curve: 'linear' }, a: 0.5 },
            },
          },
        ],
      },
    })
    render(<Inspector />)
    const cells = screen.getAllByTestId('ramp-cell')
    // Lightness, chroma and alpha come from the layer; only hue varies.
    // Read data-colour rather than style: jsdom rewrites 60% as 0.6.
    expect(cells[0].getAttribute('data-colour')).toBe('oklch(60% 0.2 0 / 0.5)')
    expect(cells[1].getAttribute('data-colour')).toBe('oklch(60% 0.2 240 / 0.5)')
  })

  // The truncation caveat is only useful if it is actually threaded: the
  // ModulatorEditor unit test cannot tell whether the Inspector ever passes
  // the flag. Cap the budget below the requested count so the evaluation
  // really does truncate.
  it('warns on a modulated field when the evaluation truncated', () => {
    const doc = useStore.getState().doc
    useStore.setState({
      doc: {
        ...doc,
        maxInstances: 6,
        layers: [
          {
            ...doc.layers[0],
            style: {
              fill: { l: 0.6, c: 0.2, h: { base: 0, to: 240, source: 'index', curve: 'linear' }, a: 1 },
            },
          },
        ],
      },
    })
    render(<Inspector />)
    expect(screen.getAllByTestId('ramp-truncated').length).toBeGreaterThan(0)
  })

  it('shows no truncation warning when the whole document fits', () => {
    const doc = useStore.getState().doc
    useStore.setState({
      doc: {
        ...doc,
        layers: [
          {
            ...doc.layers[0],
            style: {
              fill: { l: 0.6, c: 0.2, h: { base: 0, to: 240, source: 'index', curve: 'linear' }, a: 1 },
            },
          },
        ],
      },
    })
    render(<Inspector />)
    expect(screen.queryByTestId('ramp-truncated')).toBeNull()
  })

  // The swatch fixtures above give every sibling channel as a plain number, so
  // `channelBase`'s modulated branch never ran: reading `.to` instead of
  // `.base` was invisible. Two modulated channels at once, with bases and ramp
  // targets far apart, so each swatch names which one it used.
  it('builds a swatch from a sibling channel base, not from its ramp target', () => {
    const doc = useStore.getState().doc
    useStore.setState({
      doc: {
        ...doc,
        layers: [
          {
            ...doc.layers[0],
            repeaters: [{ ...doc.layers[0].repeaters[0], count: 2 }],
            style: {
              fill: {
                l: { base: 0.6, to: 0, source: 'index', curve: 'linear' },
                c: 0.2,
                h: { base: 0, to: 240, source: 'index', curve: 'linear' },
                a: 1,
              },
            },
          },
        ],
      },
    })
    render(<Inspector />)

    // The hue strip varies hue and must hold lightness at its *base* of 0.6
    // (60%), not at its ramp target of 0 (0%).
    const hueCells = within(screen.getByTestId('field-fill-h')).getAllByTestId('ramp-cell')
    expect(hueCells.map((c) => c.getAttribute('data-colour'))).toEqual([
      'oklch(60% 0.2 0 / 1)',
      'oklch(60% 0.2 240 / 1)',
    ])

    // And symmetrically: the lightness strip holds hue at its base of 0, not
    // at its ramp target of 240.
    const lightnessCells = within(screen.getByTestId('field-fill-l')).getAllByTestId('ramp-cell')
    expect(lightnessCells.map((c) => c.getAttribute('data-colour'))).toEqual([
      'oklch(60% 0.2 0 / 1)',
      'oklch(0% 0.2 0 / 1)',
    ])
  })

  it('offers no modulate toggle on the repeater fields that cannot vary', () => {
    render(<Inspector />)
    expect(screen.queryByRole('button', { name: 'repeat 1 count modulate' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'repeat 1 radius modulate' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'repeat 1 start modulate' })).toBeNull()
    expect(screen.getByRole('button', { name: 'repeat 1 spin modulate' })).toBeDefined()
  })
})
