// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import RampPreview from './RampPreview'

describe('RampPreview', () => {
  it('renders one cell per value', () => {
    render(<RampPreview values={[0, 0.5, 1]} label="fill hue preview" />)
    expect(screen.getAllByTestId('ramp-cell')).toHaveLength(3)
  })

  it('renders swatches when given a colour mapper', () => {
    const toColour = (v: number) => `oklch(60% 0.2 ${v} / 1)`
    render(<RampPreview values={[0, 180]} label="fill hue preview" toColour={toColour} />)
    const cells = screen.getAllByTestId('ramp-cell')
    // Assert the mapper's own output via data-colour, not the style
    // attribute: jsdom re-serialises oklch() and rewrites 60% as 0.6.
    expect(cells[0].getAttribute('data-colour')).toBe('oklch(60% 0.2 0 / 1)')
    expect(cells[1].getAttribute('data-colour')).toBe('oklch(60% 0.2 180 / 1)')
    expect(cells[0].getAttribute('style')).toContain('oklch')
  })

  // `high > low` also holds for a 0%-to-100% scale, so it could never catch
  // the `10 +` floor going missing -- the smallest bar would silently become
  // a zero-height nothing. Assert the exact ends: for [10, 20] the formula is
  // 10 + 90 * (value - 10) / 10, so the low bar is 10% and the high is 100%.
  it('scales bar heights across the values own range, floored at 10%', () => {
    render(<RampPreview values={[10, 20]} label="shape sides preview" />)
    const heights = screen.getAllByTestId('ramp-cell').map((el) => el.style.height)
    expect(heights).toEqual(['10%', '100%'])
  })

  it('keeps the floor for values in between, so no bar vanishes', () => {
    render(<RampPreview values={[0, 1, 2]} label="shape sides preview" />)
    const heights = screen.getAllByTestId('ramp-cell').map((el) => el.style.height)
    expect(heights).toEqual(['10%', '55%', '100%'])
  })

  it('renders flat bars when every value is identical', () => {
    render(<RampPreview values={[5, 5, 5]} label="shape sides preview" />)
    const heights = screen.getAllByTestId('ramp-cell').map((el) => el.style.height)
    expect(heights).toEqual(['50%', '50%', '50%'])
  })

  it('says so when the layer has no copies', () => {
    render(<RampPreview values={[]} label="fill hue preview" />)
    expect(screen.getByTestId('ramp-empty')).toBeDefined()
    expect(screen.queryAllByTestId('ramp-cell')).toHaveLength(0)
  })

  // getByLabelText matches an aria-label on a bare <div>, but assistive tech
  // does not announce one: with no role there is nothing for the name to name.
  // Asserted by role so the label is verified the way a screen reader sees it,
  // on both branches -- the empty branch had no label test at all.
  it('exposes its label to assistive tech, not just to the test query', () => {
    render(<RampPreview values={[0, 1]} label="fill hue preview" />)
    expect(screen.getByRole('img', { name: 'fill hue preview' })).toBeDefined()
  })

  it('exposes the same label when there are no copies', () => {
    render(<RampPreview values={[]} label="fill hue preview" />)
    expect(screen.getByRole('img', { name: 'fill hue preview' })).toBeDefined()
    expect(screen.getByLabelText('fill hue preview')).toBeDefined()
  })
})
