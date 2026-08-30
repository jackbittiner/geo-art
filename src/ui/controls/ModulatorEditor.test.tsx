// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ModulatorEditor from './ModulatorEditor'
import { COLOUR_FIELDS, REPEATER_FIELDS, SHAPE_FIELDS, type FieldDescriptor } from '../descriptors'
import { toModulated } from '../modulation'
import type { Modulated } from '../../geometry/field'

const hue = COLOUR_FIELDS.find((d) => d.key === 'h')!
const spin = REPEATER_FIELDS.radial.find((d) => d.key === 'spin')!
const shapeRadius = SHAPE_FIELDS.polygon.find((d) => d.key === 'radius')!

const field = (over: Partial<Modulated> = {}): Modulated => ({
  base: 280, to: 400, source: 'index', curve: 'linear', ...over,
})

type EditorProps = Parameters<typeof ModulatorEditor>[0]

function setup(over: Partial<EditorProps> = {}) {
  const onChange = vi.fn()
  const onCommit = vi.fn()
  render(
    <ModulatorEditor
      idPrefix="field-fill-h"
      accessibleName="fill hue"
      descriptor={hue}
      field={field()}
      count={12}
      layerCount={12}
      resolution="instance"
      onChange={onChange}
      onCommit={onCommit}
      {...over}
    />,
  )
  return { onChange, onCommit }
}

describe('ModulatorEditor', () => {
  it('renders the three controls under scoped names', () => {
    setup()
    expect(screen.getByLabelText('fill hue to')).toBeDefined()
    expect(screen.getByLabelText('fill hue curve')).toBeDefined()
    expect(screen.getByLabelText('fill hue cycles')).toBeDefined()
  })

  it('edits `to` while preserving everything else', () => {
    const { onChange } = setup()
    fireEvent.change(screen.getByLabelText('fill hue to'), { target: { value: '340' } })
    expect(onChange).toHaveBeenCalledWith({
      base: 280, to: 340, source: 'index', curve: 'linear',
    })
  })

  it('edits the curve', () => {
    const { onChange } = setup()
    fireEvent.change(screen.getByLabelText('fill hue curve'), { target: { value: 'easeOut' } })
    expect(onChange).toHaveBeenCalledWith({
      base: 280, to: 400, source: 'index', curve: 'easeOut',
    })
  })

  it('preserves cycles when editing an unrelated control', () => {
    const { onChange } = setup({ field: field({ cycles: 3 }) })
    fireEvent.change(screen.getByLabelText('fill hue to'), { target: { value: '340' } })
    expect(onChange).toHaveBeenCalledWith({
      base: 280, to: 340, source: 'index', curve: 'linear', cycles: 3,
    })
  })

  it('writes cycles above one, and omits the key at one', () => {
    const { onChange } = setup({ field: field({ cycles: 3 }) })
    fireEvent.change(screen.getByLabelText('fill hue cycles'), { target: { value: '1' } })
    expect(onChange).toHaveBeenCalledWith({
      base: 280, to: 400, source: 'index', curve: 'linear',
    })
    fireEvent.change(screen.getByLabelText('fill hue cycles'), { target: { value: '4' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ cycles: 4 }))
  })

  it('makes the field constant at its base', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'fill hue make constant' }))
    expect(onChange).toHaveBeenCalledWith(280)
  })

  // The editor's own commit wiring, asserted directly: deleting every
  // onPointerUp and onBlur in this component used to leave the whole suite
  // green, because the only thing exercising them was the row above.
  it('commits the `to` gesture when the pointer is released', () => {
    const { onCommit } = setup()
    fireEvent.pointerUp(screen.getByLabelText('fill hue to'))
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('commits the `to` gesture on blur, for keyboard-driven changes', () => {
    const { onCommit } = setup()
    fireEvent.blur(screen.getByLabelText('fill hue to'))
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('commits the cycles gesture when the pointer is released', () => {
    const { onCommit } = setup()
    fireEvent.pointerUp(screen.getByLabelText('fill hue cycles'))
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  // `constant` is a discrete click that fires no pointer event of its own, so
  // without an explicit commit it left the coalesce group its own onChange
  // opened standing, for the next slider drag to join.
  it('commits when the field is made constant', () => {
    const { onCommit } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'fill hue make constant' }))
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('lets a wrapping field target a full turn either side of base', () => {
    setup()
    const to = screen.getByLabelText('fill hue to') as HTMLInputElement
    expect(Number(to.min)).toBe(-80) // 280 - 360
    expect(Number(to.max)).toBe(640) // 280 + 360
  })

  // Was asserted on spin, which now wraps -- see the spin test below. Shape
  // radius is a genuinely non-wrapping perCopy field: 600px is 600px.
  it('bounds a non-wrapping field by its descriptor', () => {
    setup({ descriptor: shapeRadius, field: field({ base: 50, to: 300 }), accessibleName: 'shape radius' })
    const to = screen.getByLabelText('shape radius to') as HTMLInputElement
    expect(Number(to.min)).toBe(0)
    expect(Number(to.max)).toBe(600)
  })

  // spin's rampTo is a full turn, so toModulated(spin, 45) writes to: 405 --
  // outside the descriptor's -360..360. The slider used to pin its thumb at
  // 360 while the readout said 405, and the first drag silently rewrote the
  // document. spin wraps, so base ± 360 is the honest range.
  it('lets spin reach the full turn its own toggle writes', () => {
    const written = toModulated(spin, 45)
    expect(written.to).toBe(405)
    setup({ descriptor: spin, field: written, accessibleName: 'repeat 1 spin' })
    const to = screen.getByLabelText('repeat 1 spin to') as HTMLInputElement
    expect(Number(to.min)).toBe(-315)
    expect(Number(to.max)).toBe(405)
    expect(to.value).toBe('405')
  })

  // The belt to the wraps braces: a `to` from any source at all -- an older
  // file, a narrowed descriptor, a hand-edited document -- must be
  // representable, or rendering the editor is enough to lose it.
  it('widens the range to admit a `to` outside it, whatever its source', () => {
    setup({ descriptor: shapeRadius, field: field({ base: 50, to: 900 }), accessibleName: 'shape radius' })
    const above = screen.getByLabelText('shape radius to') as HTMLInputElement
    expect(Number(above.max)).toBe(900)
    expect(Number(above.min)).toBe(0)

    cleanup()
    setup({ descriptor: shapeRadius, field: field({ base: 50, to: -200 }), accessibleName: 'shape radius' })
    const below = screen.getByLabelText('shape radius to') as HTMLInputElement
    expect(Number(below.min)).toBe(-200)
    expect(Number(below.max)).toBe(600)
  })

  // The invariant that would have caught the spin bug, stated once for every
  // field the toggle can be pressed on: whatever `toModulated` writes, the
  // editor that opens next to it must be able to represent. It spans
  // descriptors, modulation and this component, so it has to be asserted
  // against the rendered control rather than against either half alone.
  it('can represent whatever toModulated writes, for every perCopy descriptor', () => {
    const perCopy: FieldDescriptor[] = [
      ...Object.values(SHAPE_FIELDS).flat(),
      ...Object.values(REPEATER_FIELDS).flat(),
      ...COLOUR_FIELDS,
    ].filter((d) => d.perCopy)
    expect(perCopy.length).toBeGreaterThan(0)

    // Several bases across each range, not one: an offset ramp only overruns
    // from the far end of its range, and on a symmetric field like rotation a
    // single representative base near the middle sails through while base 165
    // writes a `to` of 525. The bug hides from any one sample.
    const fractions = [0.13, 0.37, 0.5, 0.73, 0.91]

    for (const descriptor of perCopy) {
      for (const fraction of fractions) {
        const base = descriptor.min + (descriptor.max - descriptor.min) * fraction
        const written = toModulated(descriptor, base)

        cleanup()
        setup({ descriptor, field: written, accessibleName: 'field' })
        const to = screen.getByLabelText('field to') as HTMLInputElement
        expect(Number(to.min), `${descriptor.key} at base ${base}: to ${written.to} below min`)
          .toBeLessThanOrEqual(written.to)
        expect(Number(to.max), `${descriptor.key} at base ${base}: to ${written.to} above max`)
          .toBeGreaterThanOrEqual(written.to)
      }
    }
  })

  it('previews against the layer real copy count', () => {
    setup({ count: 5 })
    expect(screen.getAllByTestId('ramp-cell')).toHaveLength(5)
  })

  // The `descriptor.preview === 'gradient'` gate had no coverage either way:
  // deleting it left every test green, and swatches would have appeared on
  // sides and radius previews where a colour means nothing.
  const swatch = (v: number) => `oklch(60% 0.2 ${v} / 1)`

  it('paints swatches for a descriptor that previews as a gradient', () => {
    setup({ count: 2, toColour: swatch })
    const cells = screen.getAllByTestId('ramp-cell')
    expect(cells[0].getAttribute('data-colour')).toBe('oklch(60% 0.2 280 / 1)')
    expect(cells[1].getAttribute('data-colour')).toBe('oklch(60% 0.2 400 / 1)')
  })

  it('draws bars, not swatches, for a descriptor that does not', () => {
    const bars: FieldDescriptor = { ...shapeRadius, preview: 'bars' }
    setup({ descriptor: bars, count: 2, toColour: swatch, accessibleName: 'shape radius' })
    for (const cell of screen.getAllByTestId('ramp-cell')) {
      expect(cell.getAttribute('data-colour')).toBeNull()
      expect(cell.style.height).not.toBe('')
    }
  })

  it('treats an unset preview as bars, so a mapper is still ignored', () => {
    expect(shapeRadius.preview).toBeUndefined()
    setup({ descriptor: shapeRadius, count: 2, toColour: swatch, accessibleName: 'shape radius' })
    for (const cell of screen.getAllByTestId('ramp-cell')) {
      expect(cell.getAttribute('data-colour')).toBeNull()
    }
  })

  // Which count the strip normalises against depends on the ramp's source,
  // and the two only coincided while a layer had a single repeater. Under a
  // chain, an `index` ramp restarts at every parent copy while a `flatIndex`
  // ramp runs once across the layer -- so a component handed both counts has
  // to choose, and choosing wrong is silent.
  it('spreads an index ramp over the level it resolves at, not the layer', () => {
    setup({ count: 3, layerCount: 12, toColour: (v: number) => `h${v}` })
    const cells = screen.getAllByTestId('ramp-cell')
    expect(cells.map((c) => c.getAttribute('data-colour'))).toEqual(['h280', 'h340', 'h400'])
  })

  it('spreads a flatIndex ramp over the whole layer', () => {
    setup({ field: field({ source: 'flatIndex' }), count: 3, layerCount: 12 })
    expect(screen.getAllByTestId('ramp-cell')).toHaveLength(12)
  })

  // A repeater's own fields are resolved while the chain is still being
  // expanded, where flatIndex and total are the root context's 0 and 1 -- so
  // the engine holds such a ramp at base for every copy. The source alone
  // cannot say that; only the scope can.
  it('holds a repeater field’s flatIndex ramp to a single cell, as the engine does', () => {
    // One cell is the whole ramp: previewValues over a count of 1 can only
    // resolve at flatIndex 0 of total 1, which is `base` -- exactly what the
    // canvas draws for all 12 copies. Twelve cells would promise a sweep.
    setup({
      descriptor: spin, accessibleName: 'repeat 1 spin', resolution: 'expansion',
      field: field({ base: 0, to: 90, source: 'flatIndex' }), count: 12, layerCount: 12,
    })
    expect(screen.getAllByTestId('ramp-cell')).toHaveLength(1)
  })

  // The preview normalises against the copy count it is handed, but the ramp
  // itself normalises against the count the repeater *intended*. Truncation
  // splits the two, and the preview then promises a sweep the canvas never
  // shows. Until the engine surfaces the intended count, say so.
  it('warns that the preview overstates the ramp when the layer is truncated', () => {
    setup({ caveat: 'truncated' })
    expect(screen.getByTestId('ramp-caveat').textContent)
      .toContain('preview shows the full ramp')
  })

  // The second way the denominator stops being the engine's: no budget
  // pressure, no truncation, just parents that each made a different number of
  // copies. It borrows truncation's fallback number, so it needs a note of its
  // own rather than truncation's silence.
  it('warns that the preview evens out a link whose parents differ', () => {
    setup({ caveat: 'uneven' })
    expect(screen.getByTestId('ramp-caveat').textContent).toContain('uneven copies')
  })

  it('stays quiet when the denominator is the one the engine used', () => {
    setup()
    expect(screen.queryByTestId('ramp-caveat')).toBeNull()
  })

  // The caveat is about `count`; a flatIndex ramp never uses it. Warning
  // anyway would train the user to ignore the note on the strips that need it.
  it('stays quiet on a flatIndex ramp, which never uses the fallback count', () => {
    setup({ field: field({ source: 'flatIndex' }), caveat: 'uneven' })
    expect(screen.queryByTestId('ramp-caveat')).toBeNull()
  })

  // RampPreview's cells are empty `flex-1` divs, so its own max-content width
  // is just the gaps -- 23px for 24 cells. It stayed that narrow because the
  // `constant` button's `ml-auto` claimed the rest of the row. The width has
  // to be granted here, at the call site, so RampPreview stays layout-agnostic.
  //
  // jsdom performs no layout: this asserts the classes that grant the width,
  // not a rendered width. Only a browser can confirm the strip is wide.
  it('grants the preview the row width rather than the constant button', () => {
    setup()
    const strip = screen.getByLabelText('fill hue preview')
    const wrapper = strip.parentElement!
    expect(wrapper.className).toContain('flex-1')
    expect(wrapper.className).toContain('min-w-0')
    const button = screen.getByRole('button', { name: 'fill hue make constant' })
    expect(button.className).not.toContain('ml-auto')
  })
})
