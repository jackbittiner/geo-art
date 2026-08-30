// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ModulatorEditor from './ModulatorEditor'
import { COLOUR_FIELDS, REPEATER_FIELDS } from '../descriptors'
import type { Modulated } from '../../geometry/field'

const hue = COLOUR_FIELDS.find((d) => d.key === 'h')!
const spin = REPEATER_FIELDS.radial.find((d) => d.key === 'spin')!

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

  it('bounds a non-wrapping field by its descriptor', () => {
    setup({ descriptor: spin, field: field({ base: 50, to: 360 }), accessibleName: 'repeat 1 spin' })
    const to = screen.getByLabelText('repeat 1 spin to') as HTMLInputElement
    expect(Number(to.min)).toBe(-360)
    expect(Number(to.max)).toBe(360)
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
