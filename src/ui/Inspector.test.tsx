// @vitest-environment jsdom
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import Inspector, { chainCountLabel, truncatedThrough } from './Inspector'
import { useStore } from '../state/store'
import { emptyDocument, defaultLayer, DEFAULT_FILL, DEFAULT_STROKE } from '../document/defaults'
import { emptyHistory } from '../state/history'
import { isModulated, type Modulated } from '../geometry/field'
// Every fixture below is seeded through defaultLayer/seed(), which always
// starts with a radial repeater, so this narrowing is honest rather than a
// cast papering over doubt about the union.
import type { RadialConfig } from '../geometry/repeaters'

function seed() {
  const doc = emptyDocument()
  doc.layers.push(defaultLayer('halo'))
  useStore.setState({ doc, selectedLayerId: doc.layers[0].id, history: emptyHistory() })
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
    expect(screen.getByTestId('card-fill')).toBeDefined()
    expect(screen.getByTestId('card-stroke')).toBeDefined()
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

  it('renders the fill card in its off state for a layer with no fill, without crashing', () => {
    const doc = useStore.getState().doc
    useStore.setState({
      doc: {
        ...doc,
        layers: [{ ...doc.layers[0], style: {} }],
      },
    })
    expect(() => render(<Inspector />)).not.toThrow()
    expect(screen.getByTestId('card-fill')).toBeDefined()
    expect(screen.queryByLabelText('fill hue')).toBeNull()
  })

  it('renders the fill cards four channels for a layer with a fill', () => {
    render(<Inspector />)
    expect(screen.getByLabelText('fill lightness')).toBeDefined()
    expect(screen.getByLabelText('fill chroma')).toBeDefined()
    expect(screen.getByLabelText('fill hue')).toBeDefined()
    expect(screen.getByLabelText('fill alpha')).toBeDefined()
  })

  // This is the bug Phase 1 shipped: gating the whole style section on
  // layer.style.fill left a stroke-only layer (the Moiré starter's rings)
  // with no colour controls at all. Assert the stroke card's own rows render
  // *and* that no fill row leaks in -- the fill gate must be gone, not just
  // relocated.
  it('renders the stroke cards colour and width rows for a stroke-only layer, with no fill rows', () => {
    const doc = useStore.getState().doc
    useStore.setState({
      doc: {
        ...doc,
        layers: [
          {
            ...doc.layers[0],
            style: { stroke: { colour: { l: 0.6, c: 0.2, h: 200, a: 1 }, width: 3 } },
          },
        ],
      },
    })
    render(<Inspector />)
    expect(screen.getByLabelText('stroke lightness')).toBeDefined()
    expect(screen.getByLabelText('stroke chroma')).toBeDefined()
    expect(screen.getByLabelText('stroke hue')).toBeDefined()
    expect(screen.getByLabelText('stroke alpha')).toBeDefined()
    expect(screen.getByLabelText('stroke width')).toBeDefined()
    expect(screen.queryByLabelText('fill lightness')).toBeNull()
    expect(screen.queryByLabelText('fill chroma')).toBeNull()
    expect(screen.queryByLabelText('fill hue')).toBeNull()
    expect(screen.queryByLabelText('fill alpha')).toBeNull()
  })

  it('edits a stroke colour channel', () => {
    const doc = useStore.getState().doc
    useStore.setState({
      doc: {
        ...doc,
        layers: [
          {
            ...doc.layers[0],
            style: { stroke: { colour: { l: 0.6, c: 0.2, h: 200, a: 1 }, width: 3 } },
          },
        ],
      },
    })
    render(<Inspector />)
    fireEvent.change(screen.getByLabelText('stroke hue'), { target: { value: '55' } })
    expect(useStore.getState().doc.layers[0].style.stroke!.colour.h).toBe(55)
  })

  it('edits the stroke width', () => {
    const doc = useStore.getState().doc
    useStore.setState({
      doc: {
        ...doc,
        layers: [
          {
            ...doc.layers[0],
            style: { stroke: { colour: { l: 0.6, c: 0.2, h: 200, a: 1 }, width: 3 } },
          },
        ],
      },
    })
    render(<Inspector />)
    fireEvent.change(screen.getByLabelText('stroke width'), { target: { value: '9' } })
    expect(useStore.getState().doc.layers[0].style.stroke!.width).toBe(9)
  })

  it('turns fill off, clearing it from the document', () => {
    render(<Inspector />)
    fireEvent.click(screen.getByLabelText('Toggle fill'))
    expect(useStore.getState().doc.layers[0].style.fill).toBeUndefined()
    expect(screen.queryByLabelText('fill hue')).toBeNull()
    expect(screen.getByTestId('card-fill').textContent).toMatch(/no fill/i)
  })

  it('restores the same fill colour when toggled back on, not a default', () => {
    const doc = useStore.getState().doc
    const customFill = { l: 0.3, c: 0.25, h: 15, a: 0.9 }
    useStore.setState({
      doc: {
        ...doc,
        layers: [{ ...doc.layers[0], style: { ...doc.layers[0].style, fill: customFill } }],
      },
    })
    render(<Inspector />)
    fireEvent.click(screen.getByLabelText('Toggle fill'))
    expect(useStore.getState().doc.layers[0].style.fill).toBeUndefined()
    fireEvent.click(screen.getByLabelText('Toggle fill'))
    expect(useStore.getState().doc.layers[0].style.fill).toEqual(customFill)
  })

  it('gives the default fill for a layer whose fill was never customised', () => {
    const doc = useStore.getState().doc
    useStore.setState({ doc: { ...doc, layers: [{ ...doc.layers[0], style: {} }] } })
    render(<Inspector />)
    // Never toggled off in this session, so there is nothing stashed for it.
    fireEvent.click(screen.getByLabelText('Toggle fill'))
    expect(useStore.getState().doc.layers[0].style.fill).toEqual(DEFAULT_FILL)
  })

  it('turns stroke off, clearing it from the document', () => {
    const doc = useStore.getState().doc
    useStore.setState({
      doc: {
        ...doc,
        layers: [
          {
            ...doc.layers[0],
            style: { stroke: { colour: { l: 0.6, c: 0.2, h: 200, a: 1 }, width: 3 } },
          },
        ],
      },
    })
    render(<Inspector />)
    fireEvent.click(screen.getByLabelText('Toggle stroke'))
    expect(useStore.getState().doc.layers[0].style.stroke).toBeUndefined()
    expect(screen.queryByLabelText('stroke hue')).toBeNull()
    expect(screen.getByTestId('card-stroke').textContent).toMatch(/no stroke/i)
  })

  it('restores the same stroke when toggled back on, not a default', () => {
    const doc = useStore.getState().doc
    const customStroke = { colour: { l: 0.4, c: 0.3, h: 320, a: 0.7 }, width: 11 }
    useStore.setState({
      doc: {
        ...doc,
        layers: [{ ...doc.layers[0], style: { ...doc.layers[0].style, stroke: customStroke } }],
      },
    })
    render(<Inspector />)
    fireEvent.click(screen.getByLabelText('Toggle stroke'))
    expect(useStore.getState().doc.layers[0].style.stroke).toBeUndefined()
    fireEvent.click(screen.getByLabelText('Toggle stroke'))
    expect(useStore.getState().doc.layers[0].style.stroke).toEqual(customStroke)
  })

  it('gives the default stroke for a fill-only layer that never had one', () => {
    render(<Inspector />)
    // defaultLayer has a fill and no stroke -- nothing stashed for stroke yet.
    fireEvent.click(screen.getByLabelText('Toggle stroke'))
    expect(useStore.getState().doc.layers[0].style.stroke).toEqual(DEFAULT_STROKE)
  })

  it('shows both cards in their off state, plus a note, for a layer with neither fill nor stroke, and does not crash', () => {
    const doc = useStore.getState().doc
    useStore.setState({ doc: { ...doc, layers: [{ ...doc.layers[0], style: {} }] } })
    expect(() => render(<Inspector />)).not.toThrow()
    expect(screen.getByTestId('card-fill').textContent).toMatch(/no fill/i)
    expect(screen.getByTestId('card-stroke').textContent).toMatch(/no stroke/i)
    expect(screen.getByTestId('note-no-style')).toBeDefined()
  })

  // Two visibly different colours -- fill a warm, opaque, high-chroma hue and
  // stroke a cool, translucent, low-chroma one -- so a swatch accidentally
  // built from the fill would produce a plainly different string, not one
  // that happens to coincide.
  it('builds the stroke colour swatch from the strokes own channels, not the fills', () => {
    const doc = useStore.getState().doc
    useStore.setState({
      doc: {
        ...doc,
        layers: [
          {
            ...doc.layers[0],
            repeaters: [{ ...(doc.layers[0].repeaters[0] as RadialConfig), count: 2 }],
            style: {
              fill: { l: 0.9, c: 0.45, h: 10, a: 1 },
              stroke: {
                colour: { l: 0.2, c: 0.05, h: { base: 100, to: 300, source: 'index', curve: 'linear' }, a: 0.6 },
                width: 2,
              },
            },
          },
        ],
      },
    })
    render(<Inspector />)
    const cells = within(screen.getByTestId('field-stroke-h')).getAllByTestId('ramp-cell')
    expect(cells.map((c) => c.getAttribute('data-colour'))).toEqual([
      'oklch(20% 0.05 100 / 0.6)',
      'oklch(20% 0.05 300 / 0.6)',
    ])
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
    expect(screen.getByTestId('card-fill')).toBeDefined()
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
    expect(screen.getByTestId('card-fill').textContent).toContain('0.45')
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
            repeaters: [{ ...(doc.layers[0].repeaters[0] as RadialConfig), count: 5 }],
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
            repeaters: [{ ...(doc.layers[0].repeaters[0] as RadialConfig), count: 2 }],
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
            repeaters: [{ ...(doc.layers[0].repeaters[0] as RadialConfig), count: 2 }],
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

  it('gives each row a coalesce key so one drag is one undo step', () => {
    render(<Inspector />)
    const slider = screen.getByLabelText('shape radius')
    fireEvent.change(slider, { target: { value: '100' } })
    fireEvent.change(slider, { target: { value: '200' } })
    expect(useStore.getState().history.past).toHaveLength(1)
    useStore.getState().undo()
    expect((useStore.getState().doc.layers[0].shape as { radius: number }).radius).toBe(60)
  })

  it('ends the group when a slider is released', () => {
    render(<Inspector />)
    const slider = screen.getByLabelText('shape radius')
    fireEvent.change(slider, { target: { value: '100' } })
    fireEvent.pointerUp(slider)
    fireEvent.change(slider, { target: { value: '200' } })
    expect(useStore.getState().history.past).toHaveLength(2)
  })

  // The `~` toggle is a discrete click routed through the same onChange the
  // row binds with a per-row coalesce key, and it fires no pointer event of
  // its own. Without an explicit commit it opened a group the next drag of
  // the ramp it just revealed joined, so a single undo threw away both the
  // ramp *and* the toggle -- the toggle being precisely the thing spec §1
  // names undo as existing to make safe.
  it('does not let the modulate toggle share a group with the ramp it reveals', () => {
    render(<Inspector />)

    fireEvent.click(screen.getByRole('button', { name: 'fill hue modulate' }))
    expect(useStore.getState().history.past).toHaveLength(1)

    fireEvent.change(screen.getByLabelText('fill hue to'), { target: { value: '200' } })
    expect(useStore.getState().history.past).toHaveLength(2)

    // And the two steps come back separately: one undo returns the ramp
    // target the toggle chose, leaving the field still modulated.
    useStore.getState().undo()
    const hue = useStore.getState().doc.layers[0].style.fill!.h
    expect(isModulated(hue)).toBe(true)
    expect((hue as Modulated).to).toBe(400)
  })

  // Same shape, from the other side: `constant` replaces the ramp with its
  // base and fires no pointer event either, so a slider dragged straight
  // afterwards used to join the group the button opened.
  it('does not let `constant` share a group with the slider that follows it', () => {
    render(<Inspector />)
    fireEvent.click(screen.getByRole('button', { name: 'fill hue modulate' }))

    fireEvent.click(screen.getByRole('button', { name: 'fill hue make constant' }))
    expect(useStore.getState().history.past).toHaveLength(2)

    fireEvent.change(screen.getByLabelText('fill hue'), { target: { value: '200' } })
    expect(useStore.getState().history.past).toHaveLength(3)
  })

  // Nested inside `describe('Inspector', ...)`, not appended as a sibling:
  // its beforeEach(seed) only runs for tests declared within this describe's
  // scope, and every test below relies on starting from a single fresh
  // radial repeater.
  describe('the repeater chain', () => {
    it('adds a repeater to the end of the chain', () => {
      render(<Inspector />)
      fireEvent.click(screen.getByTestId('add-repeater'))
      expect(screen.getByTestId('card-repeater-1')).toBeDefined()
      expect(useStore.getState().doc.layers[0].repeaters).toHaveLength(2)
    })

    it('changes a repeater’s type from its header', () => {
      render(<Inspector />)
      fireEvent.change(screen.getByLabelText('repeat 1 type'), { target: { value: 'grid' } })
      expect(useStore.getState().doc.layers[0].repeaters[0].type).toBe('grid')
      // The grid's own rows render, so the descriptor table was consulted.
      expect(screen.getByLabelText('repeat 1 rows')).toBeDefined()
    })

    it('moves a repeater earlier in the chain', () => {
      render(<Inspector />)
      fireEvent.click(screen.getByTestId('add-repeater'))
      fireEvent.change(screen.getByLabelText('repeat 2 type'), { target: { value: 'grid' } })
      fireEvent.click(screen.getByLabelText('Move repeat 2 up'))
      expect(useStore.getState().doc.layers[0].repeaters.map((r) => r.type)).toEqual([
        'grid', 'radial',
      ])
    })

    it('removes a repeater', () => {
      render(<Inspector />)
      fireEvent.click(screen.getByTestId('add-repeater'))
      fireEvent.click(screen.getByLabelText('Remove repeat 1'))
      expect(useStore.getState().doc.layers[0].repeaters).toHaveLength(1)
    })

    it('disables removal of the last repeater, but not of one of two', () => {
      // Paired: the disabled assertion alone passes against a button that is
      // always disabled.
      render(<Inspector />)
      expect(screen.getByLabelText('Remove repeat 1')).toHaveProperty('disabled', true)
      fireEvent.click(screen.getByTestId('add-repeater'))
      expect(screen.getByLabelText('Remove repeat 1')).toHaveProperty('disabled', false)
    })

    it('shows the first link’s own count and later links as a product', () => {
      render(<Inspector />)
      fireEvent.click(screen.getByTestId('add-repeater'))
      fireEvent.change(screen.getByLabelText('repeat 2 type'), { target: { value: 'grid' } })
      // radial 12, then a 3x3 grid on each: 12 then 12 x 9 = 108.
      expect(screen.getByTestId('repeater-count-0').textContent).toBe('12')
      expect(screen.getByTestId('repeater-count-1').textContent).toBe('12 × 9 = 108')
    })

    it('shows a bare count for a link the budget cut short, product or no product', () => {
      // Every number here is one the UI can actually produce: maxInstances is
      // 100_000, radial count maxes at 200 and grid rows/cols at 40. The grid
      // has 1600 cells, so 62 rings get a full grid, one gets 800 cells and
      // the remaining 137 get nothing -- yet 100000 divides 200 exactly, so
      // "200 × 500 = 100000" reads as arithmetic while naming a 500 that
      // exists nowhere. The third link is worse: it claims one copy per
      // parent from a repeater that never ran on most of them.
      const doc = useStore.getState().doc
      useStore.setState({
        doc: {
          ...doc,
          layers: [
            {
              ...doc.layers[0],
              repeaters: [
                { type: 'radial', count: 200, radius: 180, startAngle: 0, spin: 0 },
                { type: 'grid', rows: 40, cols: 40, spacingX: 10, spacingY: 10, spin: 0 },
                { type: 'radial', count: 12, radius: 20, startAngle: 0, spin: 0 },
              ],
            },
          ],
        },
      })
      render(<Inspector />)
      // Link 1 ran to completion, so its own count is still a fact.
      expect(screen.getByTestId('repeater-count-0').textContent).toBe('200')
      expect(screen.getByTestId('repeater-count-1').textContent).toBe('100000')
      expect(screen.getByTestId('repeater-count-2').textContent).toBe('100000')
    })
  })
})

describe('chainCountLabel', () => {
  it('shows the bare count for the first link', () => {
    expect(chainCountLabel(1, 12, 0, false)).toBe('12')
  })

  it('shows a product for a later link', () => {
    expect(chainCountLabel(12, 108, 1, false)).toBe('12 × 9 = 108')
  })

  it('drops the product when truncation makes it inexact', () => {
    // 100 is not a multiple of 12, so no whole factorisation describes what
    // happened. Printing "12 × 8.33 = 100" would assert something false.
    expect(chainCountLabel(12, 100, 1, false)).toBe('100')
  })

  it('drops the product when the previous level is zero', () => {
    expect(chainCountLabel(0, 0, 1, false)).toBe('0')
  })

  it('drops the product for a truncated level even when the division is exact', () => {
    // The case the modulo guard cannot see, and the one the sliders actually
    // reach: [radial(200), grid(40x40)] stops at the budget, and 100000 / 200
    // is a clean 500. No 500 exists in that document -- the grid has 1600
    // cells and 137 of the 200 rings received none of them.
    expect(chainCountLabel(200, 100_000, 1, true)).toBe('100000')
  })

  it('drops the product for a link below a truncated one', () => {
    // A third link expanding truncated parents cannot be an honest factor of
    // them either: "100000 × 1 = 100000" claims each parent contributed one
    // copy, when most contributed none.
    expect(chainCountLabel(100_000, 100_000, 2, true)).toBe('100000')
  })
})

describe('truncatedThrough', () => {
  it('is false when nothing was cut short', () => {
    expect(truncatedThrough([false, false], 1)).toBe(false)
  })

  it('is true at the level that was cut short', () => {
    expect(truncatedThrough([false, true], 1)).toBe(true)
  })

  it('is false above the level that was cut short', () => {
    // Level 0 ran to completion; its own count is still a fact.
    expect(truncatedThrough([false, true], 0)).toBe(false)
  })

  it('stays true below the level that was cut short', () => {
    // Everything downstream of a cut level is expanding an incomplete set of
    // parents, so no product through it describes what happened.
    expect(truncatedThrough([false, true, false], 2)).toBe(true)
  })
})
