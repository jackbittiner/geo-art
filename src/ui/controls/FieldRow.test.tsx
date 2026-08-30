// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import FieldRow from './FieldRow'
import { COLOUR_FIELDS, REPEATER_FIELDS } from '../descriptors'
import type { Field } from '../../geometry/field'

const hue = COLOUR_FIELDS.find((d) => d.key === 'h')!
const count = REPEATER_FIELDS.radial.find((d) => d.key === 'count')!

function setup(value: Field, descriptor = hue, scope = 'fill') {
  const onChange = vi.fn()
  render(
    <FieldRow scope={scope} descriptor={descriptor} value={value} count={12} onChange={onChange} />,
  )
  return { onChange }
}

describe('FieldRow', () => {
  it('offers the toggle on a field that varies per copy', () => {
    setup(280)
    const toggle = screen.getByRole('button', { name: 'fill hue modulate' })
    expect(toggle).toBeDefined()
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
  })

  it('offers no toggle on a field that cannot vary', () => {
    // radial count resolves against the parent context: with one repeater a
    // ramp on it would silently do nothing. See spec §4a.
    setup(12, count, 'repeat 1')
    expect(screen.queryByRole('button', { name: 'repeat 1 count modulate' })).toBeNull()
  })

  it('switching on writes the descriptor ramp target', () => {
    const { onChange } = setup(280)
    fireEvent.click(screen.getByRole('button', { name: 'fill hue modulate' }))
    expect(onChange).toHaveBeenCalledWith({
      base: 280, to: 400, source: 'index', curve: 'linear',
    })
  })

  it('switching off restores base exactly, not the ramp target', () => {
    const { onChange } = setup({ base: 280, to: 400, source: 'index', curve: 'linear' })
    fireEvent.click(screen.getByRole('button', { name: 'fill hue modulate' }))
    expect(onChange).toHaveBeenCalledWith(280)
  })

  it('reports its state through aria-pressed', () => {
    setup({ base: 280, to: 400, source: 'index', curve: 'linear' })
    expect(screen.getByRole('button', { name: 'fill hue modulate' }).getAttribute('aria-pressed'))
      .toBe('true')
  })

  it('keeps the first-line slider editing base, not to', () => {
    const { onChange } = setup({ base: 280, to: 400, source: 'index', curve: 'linear' })
    fireEvent.change(screen.getByLabelText('fill hue'), { target: { value: '300' } })
    expect(onChange).toHaveBeenCalledWith({
      base: 300, to: 400, source: 'index', curve: 'linear',
    })
  })

  it('shows the editor when modulated', () => {
    setup({ base: 280, to: 400, source: 'index', curve: 'linear' })
    expect(screen.getByLabelText('fill hue to')).toBeDefined()
  })

  it('preserves a fractional base through the toggle round trip', () => {
    const { onChange } = setup(280.5)
    fireEvent.click(screen.getByRole('button', { name: 'fill hue modulate' }))
    expect(onChange).toHaveBeenCalledWith({
      base: 280.5, to: 400.5, source: 'index', curve: 'linear',
    })
  })

  it('generates ids without spaces', () => {
    setup(0, REPEATER_FIELDS.radial.find((d) => d.key === 'spin')!, 'repeat 1')
    const slider = screen.getByLabelText('repeat 1 spin')
    expect(slider.id).toBe('field-repeat-1-spin')
    expect(slider.id).not.toContain(' ')
  })
})
