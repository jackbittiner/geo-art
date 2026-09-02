// @vitest-environment jsdom
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ColourEditor from './ColourEditor'
import type { Colour } from '../../document/schema'
import type { Modulated } from '../../geometry/field'

const FLAT: Colour = { l: 0.6, c: 0.2, h: 280, a: 1 }
const hueRamp: Modulated = { base: 280, to: 40, source: 'index', curve: 'easeOut' }
const RAMPED: Colour = { ...FLAT, h: hueRamp }

/**
 * Renders the editor the way the Inspector does: the colour is state that the
 * component's own onChange feeds back in. A bare spy leaves the colour frozen
 * at its initial value, so anything whose next render depends on the edit --
 * the tabs appearing once a gradient exists -- cannot be tested at all.
 */
function setup(initial: Colour = FLAT, props: Partial<Parameters<typeof ColourEditor>[0]> = {}) {
  const onChange = vi.fn()
  function Harness() {
    const [colour, setColour] = useState(initial)
    return (
      <ColourEditor
        label="fill"
        colour={colour}
        copies={12}
        onChange={(next) => {
          onChange(next)
          setColour(next)
        }}
        onCommit={vi.fn()}
        {...props}
      >
        <div data-testid="per-channel-rows" />
      </ColourEditor>
    )
  }
  render(<Harness />)
  return { onChange }
}

// The card must be quiet until a gradient is asked for. Showing start/end
// swatches and a ramp toggle on a flat colour was the confusion: three
// controls all answering "does this sweep?", two of them describing a sweep
// that did not exist.
describe('ColourEditor, a flat colour', () => {
  it('shows one picker and no gradient controls at all', () => {
    setup(FLAT)
    expect(screen.queryByRole('button', { name: 'fill start' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'fill end' })).toBeNull()
    expect(screen.queryAllByTestId('ramp-cell')).toHaveLength(0)
  })

  it('edits the colour directly', () => {
    const { onChange } = setup(FLAT)
    fireEvent.change(screen.getByLabelText('fill hue'), { target: { value: '90' } })
    expect(onChange).toHaveBeenCalledWith({ ...FLAT, h: 90 })
  })

  it('offers one way to start a gradient', () => {
    setup(FLAT)
    expect(screen.getByRole('button', { name: 'Add fill gradient' })).toBeDefined()
  })

  it('seeds a visible sweep when a gradient is added', () => {
    const { onChange } = setup(FLAT)
    fireEvent.click(screen.getByRole('button', { name: 'Add fill gradient' }))
    expect(onChange).toHaveBeenCalledWith({
      ...FLAT,
      h: { base: 280, to: 400, source: 'index', curve: 'linear' },
    })
  })

  // Adding a gradient means wanting to shape its far end; landing back on the
  // start colour would make the click look like it did nothing.
  it('lands on the end colour once a gradient is added', () => {
    setup(FLAT)
    fireEvent.click(screen.getByRole('button', { name: 'Add fill gradient' }))
    expect(screen.getByRole('button', { name: 'fill end' }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('ColourEditor, a gradient', () => {
  it('replaces the add button with start and end tabs', () => {
    setup(RAMPED)
    expect(screen.getByRole('button', { name: 'fill start' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'fill end' })).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Add fill gradient' })).toBeNull()
  })

  it('edits the base while start is selected', () => {
    const { onChange } = setup(RAMPED)
    fireEvent.change(screen.getByLabelText('fill start hue'), { target: { value: '90' } })
    expect(onChange).toHaveBeenCalledWith({ ...RAMPED, h: { ...hueRamp, base: 90 } })
  })

  it('shows the sweep target when end is selected', () => {
    setup(RAMPED)
    fireEvent.click(screen.getByRole('button', { name: 'fill end' }))
    expect((screen.getByLabelText('fill end hue') as HTMLInputElement).value).toBe('40')
  })

  it('writes the sweep target, keeping its curve, while end is selected', () => {
    const { onChange } = setup(RAMPED)
    fireEvent.click(screen.getByRole('button', { name: 'fill end' }))
    fireEvent.change(screen.getByLabelText('fill end hue'), { target: { value: '200' } })
    expect(onChange).toHaveBeenCalledWith({ ...RAMPED, h: { ...hueRamp, to: 200 } })
  })

  it('collapses to a single colour when the gradient is removed', () => {
    const { onChange } = setup(RAMPED)
    fireEvent.click(screen.getByRole('button', { name: 'Remove fill gradient' }))
    expect(onChange).toHaveBeenCalledWith(FLAT)
  })

  it('previews the colours the copies will receive', () => {
    setup(RAMPED)
    const cells = screen.getAllByTestId('ramp-cell')
    expect(cells).toHaveLength(12)
    expect(cells[0].getAttribute('data-colour')).toContain('280')
    expect(cells[11].getAttribute('data-colour')).toContain('40')
  })
})

describe('ColourEditor, the advanced fold', () => {
  it('keeps the per-channel rows out of the way until they are asked for', () => {
    setup(RAMPED)
    expect(screen.queryByTestId('per-channel-rows')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /advanced/i }))
    expect(screen.getByTestId('per-channel-rows')).toBeDefined()
  })
})

describe('ColourEditor, a colour that cannot sweep', () => {
  // The canvas background resolves against the root context, so a gradient on
  // it would silently collapse to its base. Offering one would lie.
  it('offers no gradient at all', () => {
    setup(FLAT, { copies: undefined })
    expect(screen.queryByRole('button', { name: 'Add fill gradient' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'fill start' })).toBeNull()
    expect(screen.queryAllByTestId('ramp-cell')).toHaveLength(0)
  })

  it('still edits the colour directly', () => {
    const { onChange } = setup(FLAT, { copies: undefined })
    fireEvent.change(screen.getByLabelText('fill hue'), { target: { value: '90' } })
    expect(onChange).toHaveBeenCalledWith({ ...FLAT, h: 90 })
  })
})
