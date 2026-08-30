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
  render(
    <ModulatorEditor
      idPrefix="field-fill-h"
      accessibleName="fill hue"
      descriptor={hue}
      field={field()}
      count={12}
      onChange={onChange}
      {...over}
    />,
  )
  return { onChange }
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
